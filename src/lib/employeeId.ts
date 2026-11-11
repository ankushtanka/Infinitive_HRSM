import { Db } from 'mongodb';

/**
 * Helper to scan existing DB documents and return the highest standard numeric employee ID (< 9000).
 */
async function getHighestStandardNumericId(db: Db, orgId: string): Promise<number> {
  const [empDocs, userDocs] = await Promise.all([
    db.collection('employees')
      .find({ organizationId: orgId }, { projection: { employeeId: 1 } })
      .toArray(),
    db.collection('users')
      .find(
        { $or: [{ organizationId: orgId }, { organizationId: { $exists: false } }] },
        { projection: { employeeId: 1 } }
      )
      .toArray(),
  ]);

  const numericIds: number[] = [];
  const processId = (rawId: any) => {
    if (rawId && typeof rawId === 'string') {
      const clean = rawId.trim().toUpperCase();
      const match = clean.match(/^EMP-?(\d+)$/i);
      if (match && match[1]) {
        const num = parseInt(match[1], 10);
        if (Number.isFinite(num) && num < 9000) {
          numericIds.push(num);
        }
      } else {
        const digits = clean.replace(/\D/g, '');
        if (digits) {
          const num = parseInt(digits, 10);
          if (Number.isFinite(num) && num < 9000) {
            numericIds.push(num);
          }
        }
      }
    }
  };

  empDocs.forEach((d) => processId(d.employeeId));
  userDocs.forEach((u) => processId(u.employeeId));

  const maxNum = numericIds.length > 0 ? Math.max(...numericIds) : 0;
  return maxNum;
}

/**
 * Returns a preview of the next available Employee ID WITHOUT mutating the counters sequence.
 */
export async function peekNextEmployeeId(db: Db, organizationId: string): Promise<string> {
  const orgId = organizationId?.trim() || 'org-default';
  const counterId = `emp_seq_${orgId.toLowerCase()}`;

  const counterDoc = await db.collection('counters').findOne({ _id: counterId as any });
  if (counterDoc && typeof counterDoc.seq === 'number' && counterDoc.seq < 9000) {
    const candidate = `EMP${counterDoc.seq + 1}`;
    const [existingEmp, existingUser] = await Promise.all([
      db.collection('employees').findOne({ organizationId: orgId, employeeId: candidate }),
      db.collection('users').findOne({ employeeId: candidate }),
    ]);
    if (!existingEmp && !existingUser) {
      return candidate;
    }
  }

  const maxNum = await getHighestStandardNumericId(db, orgId);
  const nextSeq = maxNum >= 101 ? maxNum + 1 : 101;
  return `EMP${nextSeq}`;
}

/**
 * Server-side Employee ID Generator (Atomic & Concurrency Safe)
 *
 * Generates the next available standardized Employee ID for an organization.
 * Format: EMP + sequential number starting at 101 (e.g., EMP101, EMP102, EMP103, ...).
 *
 * Guarantees:
 * 1. Atomic sequence increment using MongoDB findOneAndUpdate on 'counters' collection.
 * 2. Organization-scoped sequence isolation (organizationId + employeeId uniqueness).
 * 3. Initial sequence seed scans existing records to preserve existing max numeric ID (>= 101).
 * 4. Excludes legacy/seed IDs in 9000+ range so sequence is clean (EMP101, EMP102... or EMP1001, EMP1002...).
 * 5. Zero collisions under simultaneous / concurrent employee creation requests.
 */
export async function generateNextEmployeeId(
  db: Db,
  organizationId: string
): Promise<string> {
  const orgId = organizationId?.trim() || 'org-default';
  const counterId = `emp_seq_${orgId.toLowerCase()}`;

  // 1. Ensure counter doc exists and is valid (< 9000)
  const counterDoc = await db.collection('counters').findOne({ _id: counterId as any });
  if (!counterDoc || typeof counterDoc.seq !== 'number' || counterDoc.seq >= 9000) {
    const maxNum = await getHighestStandardNumericId(db, orgId);
    const initialSeq = maxNum >= 101 ? maxNum : 100;

    await db.collection('counters').updateOne(
      { _id: counterId as any },
      { $set: { seq: initialSeq, organizationId: orgId, updatedAt: new Date() } },
      { upsert: true }
    );
  }

  // 2. Perform atomic increment to obtain guaranteed unique sequence number
  let loopCount = 0;
  while (loopCount < 100) {
    const res = await db.collection('counters').findOneAndUpdate(
      { _id: counterId as any },
      { $inc: { seq: 1 }, $set: { updatedAt: new Date() } },
      { returnDocument: 'after', upsert: true }
    );

    const nextSeq = res?.seq ?? res?.value?.seq;
    if (typeof nextSeq === 'number') {
      const candidate = `EMP${nextSeq}`;

      // Double-check candidate against DB to handle legacy gaps / manual overrides
      const [existingEmp, existingUser] = await Promise.all([
        db.collection('employees').findOne({ organizationId: orgId, employeeId: candidate }),
        db.collection('users').findOne({ employeeId: candidate }),
      ]);

      if (!existingEmp && !existingUser) {
        return candidate;
      }
    }
    loopCount++;
  }

  return `EMP${Date.now().toString().slice(-6)}`;
}

/**
 * Returns a preview of the next available Super Admin ID (e.g. SUP0002) without mutating sequence counters.
 */
export async function peekNextSuperAdminId(db: Db): Promise<string> {
  const [userDocs, empDocs] = await Promise.all([
    db.collection('users').find({ employeeId: /^SUP/i }, { projection: { employeeId: 1 } }).toArray(),
    db.collection('employees').find({ employeeId: /^SUP/i }, { projection: { employeeId: 1 } }).toArray(),
  ]);

  const nums: number[] = [];
  [...userDocs, ...empDocs].forEach((d) => {
    if (d.employeeId && typeof d.employeeId === 'string') {
      const match = d.employeeId.trim().toUpperCase().match(/^SUP-?(\d+)$/i);
      if (match && match[1]) {
        const n = parseInt(match[1], 10);
        if (Number.isFinite(n)) nums.push(n);
      }
    }
  });

  const maxNum = nums.length > 0 ? Math.max(...nums) : 0;
  let candidateSeq = maxNum + 1;
  while (candidateSeq < 9999) {
    const candidate = `SUP${String(candidateSeq).padStart(4, '0')}`;
    const [existingEmp, existingUser] = await Promise.all([
      db.collection('employees').findOne({ employeeId: candidate }),
      db.collection('users').findOne({ employeeId: candidate }),
    ]);
    if (!existingEmp && !existingUser) {
      return candidate;
    }
    candidateSeq++;
  }
  return `SUP${String(maxNum + 1).padStart(4, '0')}`;
}

/**
 * Server-side Super Admin ID Generator (Atomic & Concurrency Safe)
 * Format: SUP + 4 digits (e.g. SUP0001, SUP0002, etc.)
 */
export async function generateNextSuperAdminId(db: Db): Promise<string> {
  const counterId = 'sa_seq_global';

  // 1. Ensure counter doc exists and is seeded with highest existing SUP ID
  const counterDoc = await db.collection('counters').findOne({ _id: counterId as any });
  if (!counterDoc || typeof counterDoc.seq !== 'number') {
    const [userDocs, empDocs] = await Promise.all([
      db.collection('users').find({ employeeId: /^SUP/i }, { projection: { employeeId: 1 } }).toArray(),
      db.collection('employees').find({ employeeId: /^SUP/i }, { projection: { employeeId: 1 } }).toArray(),
    ]);
    const nums: number[] = [];
    [...userDocs, ...empDocs].forEach((d) => {
      if (d.employeeId && typeof d.employeeId === 'string') {
        const match = d.employeeId.trim().toUpperCase().match(/^SUP-?(\d+)$/i);
        if (match && match[1]) {
          const n = parseInt(match[1], 10);
          if (Number.isFinite(n)) nums.push(n);
        }
      }
    });
    const maxNum = nums.length > 0 ? Math.max(...nums) : 0;
    await db.collection('counters').updateOne(
      { _id: counterId as any },
      { $set: { seq: maxNum, updatedAt: new Date() } },
      { upsert: true }
    );
  }

  // 2. Increment atomically and check for collision
  let loopCount = 0;
  while (loopCount < 100) {
    const res = await db.collection('counters').findOneAndUpdate(
      { _id: counterId as any },
      { $inc: { seq: 1 }, $set: { updatedAt: new Date() } },
      { returnDocument: 'after', upsert: true }
    );

    const nextSeq = res?.seq ?? res?.value?.seq;
    if (typeof nextSeq === 'number') {
      const candidate = `SUP${String(nextSeq).padStart(4, '0')}`;
      const [existingEmp, existingUser] = await Promise.all([
        db.collection('employees').findOne({ employeeId: candidate }),
        db.collection('users').findOne({ employeeId: candidate }),
      ]);
      if (!existingEmp && !existingUser) {
        return candidate;
      }
    }
    loopCount++;
  }

  return `SUP${Date.now().toString().slice(-4)}`;
}


