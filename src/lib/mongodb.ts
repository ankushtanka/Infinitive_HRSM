import { MongoClient, Db, GridFSBucket, ObjectId, type CreateIndexesOptions, type IndexSpecification } from 'mongodb';

declare global {
  var _mongoClientPromise: Promise<{ client: MongoClient; db: Db }> | undefined;
}

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;
let indexesInitialized = false;

async function createDatabaseConnection(): Promise<{ client: MongoClient; db: Db }> {
  const dbName = process.env.MONGODB_DB || 'ems_hrms';
  const isProduction = process.env.NODE_ENV === 'production';
  const configuredUri = process.env.MONGODB_URI || process.env.DATABASE_URL;

  const connectionUris: string[] = [];
  if (configuredUri) {
    connectionUris.push(configuredUri);
  } else if (!isProduction) {
    connectionUris.push('mongodb://127.0.0.1:27017/ems_hrms');
  }

  if (!isProduction && process.env.MONGODB_ALLOW_LOCAL_FALLBACK === 'true' && !connectionUris.includes('mongodb://127.0.0.1:27017/ems_hrms')) {
    connectionUris.push('mongodb://127.0.0.1:27017/ems_hrms');
  }

  let lastError: any = connectionUris.length === 0
    ? new Error('No MongoDB connection string configured in environment variables (MONGODB_URI / DATABASE_URL is missing).')
    : null;

  for (const uri of connectionUris) {
    try {
      const client = new MongoClient(uri, {
        maxPoolSize: 20,
        minPoolSize: 0,
        serverSelectionTimeoutMS: 10000,
        connectTimeoutMS: 10000,
      });
      await client.connect();
      const db = client.db(dbName);

      if (!indexesInitialized) {
        await ensureProductionIndexes(db).catch((err) =>
          console.error('Error setting up MongoDB production indexes:', err)
        );
        indexesInitialized = true;
      }

      return { client, db };
    } catch (error: any) {
      lastError = error;
      console.warn(`Connection attempt failed for ${uri.includes('127.0.0.1') ? 'local Mongo' : 'primary Atlas'}, trying next fallback...`);
    }
  }

  console.error('Server Database Connection Failure Detail:', {
    message: lastError?.message || lastError,
    name: lastError?.name,
    code: lastError?.code,
  });
  throw new Error('Database service is temporarily unavailable. Please contact system administrator.');
}

export async function connectToDatabase(): Promise<{ client: MongoClient; db: Db }> {
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  try {
    if (!global._mongoClientPromise) {
      global._mongoClientPromise = createDatabaseConnection();
    }
    const conn = await global._mongoClientPromise;
    cachedClient = conn.client;
    cachedDb = conn.db;
    return conn;
  } catch (err) {
    global._mongoClientPromise = undefined;
    cachedClient = null;
    cachedDb = null;
    throw err;
  }
}

/** MongoDB error codes for "an equivalent index already exists under another name / with other options". */
const EXISTING_INDEX_CONFLICT_CODES = new Set([85, 86]);

export async function ensureProductionIndexes(db: Db): Promise<void> {
  // Creates one index. If the database already has an equivalent index (different name or options),
  // that index is kept as it is; any other failure is logged. Either way the remaining indexes are still created.
  const index = async (collection: string, keys: IndexSpecification, options: CreateIndexesOptions = {}) => {
    try {
      await db.collection(collection).createIndex(keys, options);
    } catch (err: any) {
      if (EXISTING_INDEX_CONFLICT_CODES.has(err?.code)) return;
      console.warn(`Index creation warning on "${collection}" ${JSON.stringify(keys)}:`, err?.message || err);
    }
  };

  try {
    // 1. Users: unique email & organization
    await index('users', { email: 1 }, { unique: true });
    await index('users', { organizationId: 1, email: 1 });

    // 2. Employees: unique organizationId + employeeId, organizationId + userId
    await index('employees', { organizationId: 1, employeeId: 1 }, { unique: true, sparse: true });
    await index('employees', { organizationId: 1, userId: 1 }, { sparse: true });
    await index('employees', { organizationId: 1, status: 1, department: 1 });

    // 3. Documents: organizationId + employeeId, organizationId + uploadedAt
    await index('documents', { organizationId: 1, employeeId: 1 });
    await index('documents', { organizationId: 1, uploadedAt: -1 });
    await index('documents', { organizationId: 1, category: 1 });

    // 4. Attendance: organizationId + date, organizationId + employeeId + date
    await index('attendance', { organizationId: 1, date: -1 });
    await index('attendance', { organizationId: 1, employeeId: 1, date: -1 });

    // 4b. Live tracking: sessions, location points and permissions
    // At most one ACTIVE session per employee (also guards against double-start races)
    await index('tracking_sessions',
      { organizationId: 1, employeeId: 1 },
      { unique: true, partialFilterExpression: { status: 'ACTIVE' } }
    );
    await index('tracking_sessions', { organizationId: 1, date: 1, status: 1 });
    await index('tracking_sessions', { organizationId: 1, employeeId: 1, startedAt: -1 });
    await index('employee_locations', { organizationId: 1, employeeId: 1, recordedAt: -1 });
    await index('employee_locations', { sessionId: 1, recordedAt: 1 });
    // Hard upper bound on location retention (the policy's retentionDays can only narrow this window)
    await index('employee_locations', { createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });
    await index('tracking_sessions', { createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });
    await index('tracking_permissions',
      { organizationId: 1, scope: 1, employeeId: 1 },
      { unique: true }
    );

    // 4c. Attendance Alerts: unique compound index for strict deduplication
    await index('attendance_alerts',
      { organizationId: 1, employeeId: 1, alertType: 1, date: 1 },
      { unique: true }
    );
    await index('attendance_alerts', { organizationId: 1, date: -1, status: 1 });
    await index('attendance_alerts', { organizationId: 1, alertType: 1 });
    await index('attendance_alerts', { organizationId: 1, managerId: 1 });

    // 4d. Employee Reminders & Alerts: unique compound index for strict deduplication
    await index('employee_reminders',
      { organizationId: 1, employeeId: 1, category: 1, reminderType: 1, targetDate: 1 },
      { unique: true }
    );
    await index('employee_reminders', { organizationId: 1, category: 1, status: 1 });
    await index('employee_reminders', { organizationId: 1, targetDate: 1 });
    await index('employee_reminders', { organizationId: 1, managerId: 1 });

    // 5. Leaves: organizationId + status, organizationId + employeeId + status, organizationId + startDate
    await index('leaves', { organizationId: 1, status: 1, createdAt: -1 });
    await index('leaves', { organizationId: 1, employeeId: 1, status: 1 });
    await index('leaves', { organizationId: 1, managerId: 1, status: 1 });
    await index('leaves', { organizationId: 1, startDate: 1, endDate: 1 });
    await index('leave_balances', { organizationId: 1, employeeId: 1, year: 1 }, { unique: true, sparse: true });
    await index('leave_types', { organizationId: 1, active: 1 });

    // 6. Payroll: payroll_records unique compound index, salary_rules, salary_structures
    await index('payroll_records', { organizationId: 1, employeeId: 1, payrollPeriod: 1 }, { unique: true, sparse: true });
    await index('payroll_records', { organizationId: 1, payrollPeriod: -1, status: 1 });

    // 7. Audit Logs
    await index('audit_logs', { organizationId: 1, timestamp: -1 });

    // 8. Organization metadata & Public Content
    await index('departments', { organizationId: 1 });
    await index('designations', { organizationId: 1 });
    await index('locations', { organizationId: 1 });

    // 9. HR Helpdesk & Support Tickets
    await index('hr_requests', { organizationId: 1, ticketNo: 1 }, { unique: true, sparse: true });
    await index('hr_requests', { organizationId: 1, status: 1, updatedAt: -1 });
    await index('hr_requests', { organizationId: 1, employeeId: 1 });
    await index('hr_requests', { organizationId: 1, assignedToId: 1 });

    // 10. Notifications
    await index('notifications', { organizationId: 1, recipientId: 1, status: 1, createdAt: -1 });
    await index('notifications', { organizationId: 1, createdAt: -1 });

    // 11. Auth OTP Tokens (Gmail SMTP OTP Authentication)
    await index('auth_otp_tokens', { email: 1, purpose: 1, expiresAt: -1 });
    await index('auth_otp_tokens', { expiresAt: 1 }, { expireAfterSeconds: 0 });
    await index('auth_otp_tokens', { userId: 1, createdAt: -1 });
    await index('auth_otp_tokens', { twoFactorToken: 1 }, { sparse: true });

    // 12. Authoritative User Sessions Store
    const existingColls = await db.listCollections({ name: 'user_sessions' }).toArray();
    if (existingColls.length === 0) {
      await db.createCollection('user_sessions');
    }
    await index('user_sessions', { sessionToken: 1 }, { unique: true, sparse: true });
    await index('user_sessions', { sessionId: 1 }, { unique: true, sparse: true });
    await index('user_sessions', { refreshTokenHash: 1 }, { unique: true, sparse: true });
    await index('user_sessions', { userId: 1, expiresAt: -1 });
    await index('user_sessions', { expiresAt: 1 }, { expireAfterSeconds: 0 });

    // 13. Enterprise Asset Management & Software Licenses
    await index('assets', { organizationId: 1, assetTag: 1 }, { unique: true });
    await index('assets', { organizationId: 1, serialNumber: 1 }, { sparse: true });
    await index('assets', { organizationId: 1, status: 1 });
    await index('assets', { organizationId: 1, category: 1 });
    await index('assets', { organizationId: 1, 'assignedTo.employeeId': 1 });
    await index('assets', { organizationId: 1, createdAt: -1 });

    await index('asset_assignments', { organizationId: 1, assetId: 1, assignedAt: -1 });
    await index('asset_assignments', { organizationId: 1, employeeId: 1, assignedAt: -1 });
    await index('asset_assignments', { organizationId: 1, status: 1 });

    await index('software_licenses', { organizationId: 1, name: 1 });
    await index('software_licenses', { organizationId: 1, status: 1 });
    await index('software_licenses', { organizationId: 1, 'allocations.employeeId': 1 });
  } catch (err) {
    console.warn('Index setup warning:', (err as any)?.message || err);
  }
}

export async function getGridFSBucket(bucketName: string = 'documents'): Promise<GridFSBucket> {
  const { db } = await connectToDatabase();
  return new GridFSBucket(db, { bucketName });
}

export async function uploadFileToGridFS(
  filename: string,
  mimeType: string,
  buffer: Buffer,
  bucketName: string = 'documents'
): Promise<string> {
  const bucket = await getGridFSBucket(bucketName);
  const uploadStream = bucket.openUploadStream(filename, {
    metadata: {
      contentType: mimeType,
      uploadedAt: new Date(),
    },
  });

  return new Promise((resolve, reject) => {
    uploadStream.on('finish', () => {
      resolve(uploadStream.id.toString());
    });
    uploadStream.on('error', (err) => {
      reject(err);
    });
    uploadStream.end(buffer);
  });
}

export async function getFileStreamFromGridFS(
  fileIdStr: string,
  bucketName: string = 'documents'
): Promise<{ stream: ReadableStream; filename: string; contentType: string } | null> {
  try {
    const bucket = await getGridFSBucket(bucketName);
    const { db } = await connectToDatabase();
    const objectId = new ObjectId(fileIdStr);

    const filesCollection = `${bucketName}.files`;
    const files = await db
      .collection(filesCollection)
      .find({ _id: objectId })
      .toArray();

    if (!files || files.length === 0) {
      const fallbackCollection = bucketName === 'documents' ? 'photos.files' : 'documents.files';
      const fallbackFiles = await db
        .collection(fallbackCollection)
        .find({ _id: objectId })
        .toArray();
      if (!fallbackFiles || fallbackFiles.length === 0) {
        return null;
      }
    }

    const fileDoc = files[0] || (await db.collection(bucketName === 'documents' ? 'photos.files' : 'documents.files').find({ _id: objectId }).toArray())[0];
    const nodeStream = bucket.openDownloadStream(objectId);

    const webStream = new ReadableStream({
      start(controller) {
        nodeStream.on('data', (chunk) => controller.enqueue(chunk));
        nodeStream.on('end', () => controller.close());
        nodeStream.on('error', (err) => controller.error(err));
      },
      cancel() {
        nodeStream.destroy();
      },
    });

    return {
      stream: webStream,
      filename: fileDoc.filename || 'document',
      contentType: fileDoc.metadata?.contentType || 'application/octet-stream',
    };
  } catch (error) {
    console.error('Error fetching file from GridFS:', error);
    return null;
  }
}

export async function deleteFileFromGridFS(fileIdStr: string, bucketName: string = 'documents'): Promise<boolean> {
  try {
    const bucket = await getGridFSBucket(bucketName);
    const objectId = new ObjectId(fileIdStr);
    await bucket.delete(objectId);
    return true;
  } catch (error) {
    try {
      const fallbackBucket = await getGridFSBucket(bucketName === 'documents' ? 'photos' : 'documents');
      const objectId = new ObjectId(fileIdStr);
      await fallbackBucket.delete(objectId);
      return true;
    } catch (e) {
      console.error('Error deleting file from GridFS:', error);
      return false;
    }
  }
}