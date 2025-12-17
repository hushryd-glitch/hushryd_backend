/**
 * Seed Super Admin Account
 * Run this script to create the initial super admin account
 * 
 * Usage: node scripts/seedSuperAdmin.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Connect to MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hushryd';

const SUPER_ADMIN_PERMISSIONS = [
  'staff:read',
  'staff:write', 
  'staff:delete',
  'analytics:read',
  'settings:write',
  'drivers:read',
  'passengers:read',
  'documents:read',
  'documents:write',
  'documents:verify',
  'tickets:read',
  'tickets:write',
  'payments:read',
  'transactions:read',
  'reports:read'
];

// Default Super Admin Credentials
const DEFAULT_ADMINS = [
  {
    email: 'superadmin@hushryd.com',
    password: 'SuperAdmin@123',
    name: 'Super Admin',
    role: 'super_admin'
  },
  {
    email: 'admin@hushryd.com', 
    password: 'Admin@123',
    name: 'Admin User',
    role: 'admin'
  },
  {
    email: 'operations@hushryd.com',
    password: 'Operations@123',
    name: 'Operations Team',
    role: 'operations'
  },
  {
    email: 'support@hushryd.com',
    password: 'Support@123',
    name: 'Customer Support',
    role: 'customer_support'
  },
  {
    email: 'finance@hushryd.com',
    password: 'Finance@123',
    name: 'Finance Team',
    role: 'finance'
  }
];

const ROLE_PERMISSIONS = {
  operations: [
    'drivers:read',
    'passengers:read',
    'documents:read',
    'documents:write',
    'documents:verify'
  ],
  customer_support: [
    'drivers:read',
    'passengers:read',
    'tickets:read',
    'tickets:write'
  ],
  finance: [
    'payments:read',
    'transactions:read',
    'reports:read'
  ],
  admin: [
    'drivers:read',
    'passengers:read',
    'documents:read',
    'documents:write',
    'documents:verify',
    'tickets:read',
    'tickets:write',
    'payments:read',
    'transactions:read',
    'reports:read',
    'staff:read'
  ],
  super_admin: SUPER_ADMIN_PERMISSIONS
};

async function seedAdmins() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    const User = require('../src/models/User');

    for (const admin of DEFAULT_ADMINS) {
      // Check if admin already exists
      const existing = await User.findOne({ email: admin.email.toLowerCase() });
      
      if (existing) {
        console.log(`⚠️  ${admin.role} already exists: ${admin.email}`);
        continue;
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(admin.password, 10);

      // Create admin user
      const newAdmin = new User({
        email: admin.email.toLowerCase(),
        password: hashedPassword,
        name: admin.name,
        role: admin.role,
        isStaff: true,
        isActive: true,
        permissions: ROLE_PERMISSIONS[admin.role] || []
      });

      await newAdmin.save();
      console.log(`✅ Created ${admin.role}: ${admin.email}`);
    }

    console.log('\n========================================');
    console.log('Admin Credentials:');
    console.log('========================================');
    DEFAULT_ADMINS.forEach(admin => {
      console.log(`\n${admin.role.toUpperCase()}:`);
      console.log(`  Email: ${admin.email}`);
      console.log(`  Password: ${admin.password}`);
    });
    console.log('\n========================================');
    console.log('Login URL: /auth/admin');
    console.log('========================================\n');

  } catch (error) {
    console.error('Error seeding admins:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

seedAdmins();
