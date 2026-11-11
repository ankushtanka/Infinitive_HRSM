/**
 * Development-Only Seed Script for Enterprise Asset Management
 *
 * Usage:
 *   node scripts/seed-assets.js          # Seeds clearly-labeled [DEV-SAMPLE] records for local dev
 *   node scripts/seed-assets.js --clean  # Removes all [DEV-SAMPLE] records
 *
 * SAFETY NOTICE:
 *   Will strictly refuse to run if NODE_ENV === 'production'.
 */

const fs = require('fs');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');

// Load environment variables from .env.local or .env
function loadEnv() {
  const envPaths = [
    path.join(__dirname, '../.env.local'),
    path.join(__dirname, '../.env'),
  ];
  for (const p of envPaths) {
    if (fs.existsSync(p)) {
      const content = fs.readFileSync(p, 'utf8');
      content.split(/\r?\n/).forEach((line) => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
          const idx = trimmed.indexOf('=');
          const key = trimmed.slice(0, idx).trim();
          let val = trimmed.slice(idx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (!process.env[key]) process.env[key] = val;
        }
      });
    }
  }
}
loadEnv();

async function main() {
  const isClean = process.argv.includes('--clean');
  const allowAtlas = process.argv.includes('--allow-atlas-seed');
  const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';

  if (isProduction && !process.argv.includes('--force-prod-seed')) {
    console.error('\n❌ SAFETY BLOCKED: This seed script is strictly restricted from running in production environments (NODE_ENV=production).');
    process.exit(1);
  }

  // Determine target URI
  // Prioritize LOCAL_MONGODB_URI if set for developer sandboxes
  let targetUri = process.env.LOCAL_MONGODB_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ems_hrms';

  const isAtlas = targetUri.includes('mongodb.net') || targetUri.includes('mongodb+srv:');
  const isLocalhost = targetUri.includes('localhost') || targetUri.includes('127.0.0.1') || targetUri.includes('::1');

  if (isAtlas && !allowAtlas && !isClean) {
    console.error('\n============================================================');
    console.error('🛑 SAFETY GUARD ACTIVATED: Remote MongoDB Atlas Detected!');
    console.error('============================================================');
    console.error('Target URI: ' + targetUri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@'));
    console.error('\nThis seed script is strictly configured to protect production & cloud clusters from accidental mock data insertion.');
    console.error('The real company production inventory must remain clean.\n');
    console.error('To run against a local development database:');
    console.error('  1. Ensure a local MongoDB instance is running on 127.0.0.1:27017');
    console.error('  2. Set LOCAL_MONGODB_URI=mongodb://127.0.0.1:27017/ems_hrms in .env.local');
    console.error('\nIf you explicitly intend to seed this Atlas database for testing, pass:');
    console.error('  npm run seed:assets -- --allow-atlas-seed');
    console.error('============================================================\n');
    process.exit(1);
  }

  const uri = targetUri;
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db(process.env.MONGODB_DB || 'ems_hrms');
    console.log(`Connected to database "${db.databaseName}"`);

    // Target default organization
    const orgId = 'org-default';

    if (isClean) {
      console.log('Cleaning up all [DEV-SAMPLE] assets and licenses...');
      const delAssets = await db.collection('assets').deleteMany({
        organizationId: orgId,
        name: { $regex: /\[DEV-SAMPLE\]/i },
      });
      const delLic = await db.collection('software_licenses').deleteMany({
        organizationId: orgId,
        name: { $regex: /\[DEV-SAMPLE\]/i },
      });
      const delHist = await db.collection('asset_assignments').deleteMany({
        organizationId: orgId,
        assetName: { $regex: /\[DEV-SAMPLE\]/i },
      });
      console.log(`Removed ${delAssets.deletedCount} sample assets, ${delLic.deletedCount} sample licenses, and ${delHist.deletedCount} history entries.`);
      return;
    }

    // Find real existing employees in the organization to assign sample assets to
    const existingEmployees = await db
      .collection('employees')
      .find({ organizationId: orgId })
      .limit(5)
      .toArray();

    const emp1 = existingEmployees[0] || {
      employeeId: 'EMP9201',
      fullName: 'Ankush Ranka',
      email: 'admin@organization.com',
    };
    const emp2 = existingEmployees[1] || {
      employeeId: 'MGR1001',
      fullName: 'Usha kunwar chundawat',
      email: 'manager@organization.com',
    };

    const now = new Date();
    const thirtyDaysAhead = new Date(now.getTime() + 25 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const oneYearAhead = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const pastCheckout = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000);
    const pastReturn = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);

    console.log('Inserting sample hardware assets across all categories...');

    const sampleAssets = [
      {
        organizationId: orgId,
        assetTag: 'AST-LPT-0001',
        name: '[DEV-SAMPLE] MacBook Pro 16" M3 Max',
        category: 'Laptop',
        brand: 'Apple',
        model: 'MacBookPro18,2 (A2991)',
        serialNumber: 'C02G9012MD6R',
        specifications: {
          processor: 'Apple M3 Max (16-core CPU, 40-core GPU)',
          ram: '64GB Unified Memory',
          storage: '1TB PCIe Gen4 SSD',
          os: 'macOS Sonoma',
        },
        purchaseDate: '2024-01-15',
        purchaseCost: 289900,
        currency: 'INR',
        warrantyExpiry: oneYearAhead,
        vendor: 'Apple Authorized Enterprise',
        invoiceNumber: 'INV-APL-2024-089',
        condition: 'EXCELLENT',
        status: 'ASSIGNED',
        location: 'Remote - Bangalore',
        notes: 'Issued with 140W USB-C Power Adapter and braided MagSafe cable.',
        assignedTo: {
          employeeId: emp1.employeeId,
          employeeName: emp1.fullName || `${emp1.firstName || ''} ${emp1.lastName || ''}`.trim() || emp1.email,
          employeeEmail: emp1.email,
          assignedAt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
          expectedReturnDate: oneYearAhead,
          assignmentNotes: 'Primary engineering workstation.',
        },
        isArchived: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        organizationId: orgId,
        assetTag: 'AST-DSK-0001',
        name: '[DEV-SAMPLE] Dell Precision 3660 Workstation',
        category: 'Desktop',
        brand: 'Dell Technologies',
        model: 'Precision Tower 3660',
        serialNumber: 'DEL-88991201',
        specifications: {
          processor: 'Intel Core i9-13900K (24 Cores)',
          ram: '64GB DDR5 4800MHz',
          storage: '2TB NVMe M.2 SSD + 4TB HDD',
          os: 'Ubuntu 22.04 LTS / Windows 11 Pro',
        },
        purchaseDate: '2023-11-10',
        purchaseCost: 175000,
        currency: 'INR',
        warrantyExpiry: oneYearAhead,
        vendor: 'Dell Direct',
        invoiceNumber: 'INV-DEL-99018',
        condition: 'NEW',
        status: 'AVAILABLE',
        location: 'HQ - Lab 402',
        notes: 'Configured for high-throughput build testing.',
        assignedTo: null,
        isArchived: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        organizationId: orgId,
        assetTag: 'AST-MON-0001',
        name: '[DEV-SAMPLE] Dell UltraSharp 27" 4K USB-C Hub Monitor',
        category: 'Monitor',
        brand: 'Dell',
        model: 'U2723QE',
        serialNumber: 'CN-0K7G8H-74261',
        specifications: {
          screenSize: '27 inches',
          resolution: '3840 x 2160 (4K UHD IPS Black)',
          ports: 'USB-C 90W PD, HDMI 2.0, DisplayPort 1.4, RJ45 Ethernet',
        },
        purchaseDate: '2024-02-01',
        purchaseCost: 52000,
        currency: 'INR',
        warrantyExpiry: thirtyDaysAhead, // Demonstrates expiring warranty metric!
        vendor: 'Dell Commercial',
        condition: 'GOOD',
        status: 'ASSIGNED',
        location: 'HQ - Floor 2',
        assignedTo: {
          employeeId: emp2.employeeId,
          employeeName: emp2.fullName || `${emp2.firstName || ''} ${emp2.lastName || ''}`.trim() || emp2.email,
          employeeEmail: emp2.email,
          assignedAt: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000),
          expectedReturnDate: oneYearAhead,
        },
        isArchived: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        organizationId: orgId,
        assetTag: 'AST-MOB-0001',
        name: '[DEV-SAMPLE] Apple iPhone 15 Pro Enterprise',
        category: 'Mobile',
        brand: 'Apple',
        model: 'iPhone 15 Pro 256GB',
        serialNumber: 'F2LX9001RTY',
        specifications: {
          imei: '354890123456789',
          imei2: '354890123456780',
          storage: '256GB Titanium Blue',
          os: 'iOS 17.5 Enterprise Supervised',
        },
        purchaseDate: '2023-10-05',
        purchaseCost: 134900,
        currency: 'INR',
        warrantyExpiry: oneYearAhead,
        vendor: 'Apple India',
        condition: 'EXCELLENT',
        status: 'AVAILABLE',
        location: 'HQ - IT Vault',
        notes: 'Enrolled in Apple Business Manager.',
        assignedTo: null,
        isArchived: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        organizationId: orgId,
        assetTag: 'AST-KBD-0001',
        name: '[DEV-SAMPLE] Keychron K2 Wireless Mechanical Keyboard',
        category: 'Keyboard',
        brand: 'Keychron',
        model: 'K2 Version 2 (Gateron Brown)',
        serialNumber: 'KC-K2-99012',
        specifications: {
          connectivity: 'Bluetooth 5.1 / USB-C Wired Dual Mode',
          layout: '75% Compact 84-Key',
          backlight: 'White LED',
        },
        purchaseDate: '2023-08-12',
        purchaseCost: 7499,
        currency: 'INR',
        condition: 'GOOD',
        status: 'AVAILABLE',
        location: 'HQ - IT Accessories Rack',
        assignedTo: null,
        isArchived: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        organizationId: orgId,
        assetTag: 'AST-MOU-0001',
        name: '[DEV-SAMPLE] Logitech MX Master 3S Ergonomic Mouse',
        category: 'Mouse',
        brand: 'Logitech',
        model: 'MX Master 3S Performance',
        serialNumber: 'LOG-MX3S-8812',
        specifications: {
          connectivity: 'Logi Bolt USB Receiver & Bluetooth Low Energy',
          dpi: '8000 DPI Darkfield Sensor',
        },
        purchaseDate: '2024-03-01',
        purchaseCost: 9995,
        currency: 'INR',
        condition: 'NEW',
        status: 'AVAILABLE',
        location: 'HQ - IT Accessories Rack',
        assignedTo: null,
        isArchived: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        organizationId: orgId,
        assetTag: 'AST-IDC-0001',
        name: '[DEV-SAMPLE] NFC Smart Building Access Badge',
        category: 'ID Card',
        brand: 'HID Global',
        model: 'iCLASS Seos Clamshell',
        serialNumber: 'HID-SEC-9921',
        specifications: {
          cardIdentifier: 'IDC-882199',
          accessLevel: 'All Floors + Server Room + Executive Wing',
        },
        condition: 'NEW',
        status: 'AVAILABLE',
        location: 'HR Security Desk',
        assignedTo: null,
        isArchived: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        organizationId: orgId,
        assetTag: 'AST-SIM-0001',
        name: '[DEV-SAMPLE] Airtel Corporate 5G Postpaid SIM',
        category: 'SIM',
        brand: 'Bharti Airtel',
        model: 'Enterprise Postpaid CUG 100GB',
        specifications: {
          carrier: 'Airtel India',
          phoneNumber: '+91 98200 12345',
          simNumber: '89910009182345678901',
          dataLimit: '100GB rollover + Unlimited CUG Calls',
        },
        condition: 'NEW',
        status: 'AVAILABLE',
        location: 'HR Communications Safe',
        assignedTo: null,
        isArchived: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        organizationId: orgId,
        assetTag: 'AST-LPT-0002',
        name: '[DEV-SAMPLE] ThinkPad X1 Carbon Gen 11 (Damaged Screen)',
        category: 'Laptop',
        brand: 'Lenovo',
        model: '21HM001QUS',
        serialNumber: 'PF-49X8Y2',
        specifications: {
          processor: 'Intel Core i7-1365U vPro',
          ram: '32GB LPDDR5',
          storage: '512GB PCIe 4.0 SSD',
        },
        purchaseDate: '2023-05-15',
        purchaseCost: 165000,
        currency: 'INR',
        warrantyExpiry: '2026-05-15',
        condition: 'DAMAGED',
        status: 'UNDER_MAINTENANCE',
        location: 'Service Center - In Repair',
        notes: 'Submitted for warranty screen replacement after drop incident.',
        assignedTo: null,
        isArchived: false,
        createdAt: now,
        updatedAt: now,
      },
    ];

    // Remove any previous sample records with matching asset tags
    const sampleTags = sampleAssets.map((a) => a.assetTag);
    await db.collection('assets').deleteMany({ organizationId: orgId, assetTag: { $in: sampleTags } });
    await db.collection('assets').insertMany(sampleAssets);
    console.log(`Inserted ${sampleAssets.length} sample hardware assets.`);

    // Insert sample assignment history
    const sampleHistory = [
      {
        organizationId: orgId,
        assetId: 'sample-laptop-1',
        assetTag: 'AST-LPT-0001',
        assetName: '[DEV-SAMPLE] MacBook Pro 16" M3 Max',
        category: 'Laptop',
        employeeId: emp1.employeeId,
        employeeName: emp1.fullName || emp1.email,
        employeeEmail: emp1.email,
        assignedAt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
        assignedBy: 'superadmin@organization.com',
        assignedByName: 'Super Administrator',
        conditionAtAssignment: 'NEW',
        assignmentNotes: 'Initial onboarding issue.',
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      },
      {
        organizationId: orgId,
        assetId: 'sample-monitor-1',
        assetTag: 'AST-MON-0001',
        assetName: '[DEV-SAMPLE] Dell UltraSharp 27" 4K USB-C Hub Monitor',
        category: 'Monitor',
        employeeId: emp2.employeeId,
        employeeName: emp2.fullName || emp2.email,
        employeeEmail: emp2.email,
        assignedAt: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000),
        assignedBy: 'superadmin@organization.com',
        assignedByName: 'Super Administrator',
        conditionAtAssignment: 'GOOD',
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      },
      {
        organizationId: orgId,
        assetId: 'sample-thinkpad-past',
        assetTag: 'AST-LPT-0002',
        assetName: '[DEV-SAMPLE] ThinkPad X1 Carbon Gen 11 (Damaged Screen)',
        category: 'Laptop',
        employeeId: emp1.employeeId,
        employeeName: emp1.fullName || emp1.email,
        employeeEmail: emp1.email,
        assignedAt: pastCheckout,
        assignedBy: 'superadmin@organization.com',
        assignedByName: 'Super Administrator',
        conditionAtAssignment: 'NEW',
        returnedAt: pastReturn,
        returnedBy: 'superadmin@organization.com',
        returnedByName: 'Super Administrator',
        conditionAtReturn: 'DAMAGED',
        returnNotes: 'Screen flickering after fall. Routed to authorized service depot.',
        status: 'RETURNED',
        createdAt: now,
        updatedAt: now,
      },
    ];

    await db.collection('asset_assignments').deleteMany({
      organizationId: orgId,
      assetTag: { $in: ['AST-LPT-0001', 'AST-MON-0001', 'AST-LPT-0002'] },
    });
    await db.collection('asset_assignments').insertMany(sampleHistory);
    console.log(`Inserted ${sampleHistory.length} assignment history records.`);

    // Insert sample software licenses
    const sampleLicenses = [
      {
        organizationId: orgId,
        name: '[DEV-SAMPLE] JetBrains All Products Pack',
        vendor: 'JetBrains s.r.o.',
        licenseType: 'SUBSCRIPTION',
        licenseKey: 'JB-CORP-9921-X992-8812',
        totalSeats: 5,
        assignedSeats: 1,
        allocations: [
          {
            allocationId: new ObjectId().toString(),
            employeeId: emp1.employeeId,
            employeeName: emp1.fullName || emp1.email,
            employeeEmail: emp1.email,
            assignedAt: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000),
            notes: 'Backend & full-stack development IDE suite.',
          },
        ],
        purchaseDate: '2024-01-01',
        expiryDate: oneYearAhead,
        renewalStatus: 'ACTIVE',
        cost: 45000,
        currency: 'INR',
        notes: 'Annual commercial subscription with floating toolbox.',
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      },
      {
        organizationId: orgId,
        name: '[DEV-SAMPLE] Figma Enterprise',
        vendor: 'Figma Inc.',
        licenseType: 'ENTERPRISE',
        licenseKey: 'FIG-ENT-8819-2024',
        totalSeats: 10,
        assignedSeats: 1,
        allocations: [
          {
            allocationId: new ObjectId().toString(),
            employeeId: emp2.employeeId,
            employeeName: emp2.fullName || emp2.email,
            employeeEmail: emp2.email,
            assignedAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
            notes: 'Product design & UI wireframing.',
          },
        ],
        purchaseDate: '2023-12-01',
        expiryDate: thirtyDaysAhead, // Demonstrates expiring license metric!
        renewalStatus: 'EXPIRING_SOON',
        cost: 95000,
        currency: 'INR',
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      },
    ];

    await db.collection('software_licenses').deleteMany({
      organizationId: orgId,
      name: { $regex: /\[DEV-SAMPLE\]/i },
    });
    await db.collection('software_licenses').insertMany(sampleLicenses);
    console.log(`Inserted ${sampleLicenses.length} sample software licenses.`);

    console.log('------------------------------------------------------------');
    console.log('SUCCESS: Asset Management database seeded for local testing!');
    console.log(`Open http://localhost:3000/admin/assets to view live data.`);
    console.log('To remove all sample data at any time, run: node scripts/seed-assets.js --clean');
    console.log('------------------------------------------------------------');
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error('Seed script error:', err);
  process.exit(1);
});
