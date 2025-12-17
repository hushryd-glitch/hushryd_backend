/**
 * Verify Admin Accounts
 * Run this script to check admin accounts and fix any issues
 * 
 * Usage: node scripts/verifyAdmins.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hushryd';

const ADMIN_CREDENTIALS = [
  { email: 'superadmin@hushryd.com', password: 'SuperAdmin@123', role: 'super_admin' },
  { email: 'admin@hushryd.com', password: 'Admin@123', role: 'admin' },
  { email: 'operations@hushryd.com', password: 'Operations@123', role: 'operations' },
  { email: 'support@hushryd.com', password: 'Support@123', role: 'customer_support' },
  { email: 'finance@hushryd.com', password: 'Finance@123', role: 'finance' }
];

const ROLE_PERMISSIONS = {
  operations: ['drivers:read', 'passengers:read', 'documents:read', 'documents:write', 'documents:verify'],
  customer_support: ['drivers:read', 'passengers:read', 'tickets:read', 'tickets:write'],
  finance: ['payments:read', 'transactions:read', 'reports:read'],
  admin: ['drivers:read', 'passengers:read', 'documents:read', 'documents:write', 'documents:verify', 'tickets:read', 'tickets:write', 'payments:read', 'transactions:read', 'reports:read', 'staff:read'],
  super_admin: ['staff:read', 'staff:write', 'staff:delete', 'analytics:read', 'settings:write', 'drivers:read', 'passengers:read', 'documents:read', 'documents:write', 'documents:verify', 'tickets:read', 'tickets:write', 'payments:read', 'transactions:read', 'reports:read']
};

async function verifyAdmins() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB\n');

    const User = require('../src/models/User');

    for (const admin of ADMIN_CREDENTIALS) {
      console.log(`\n========== ${admin.email} ==========`);
      
      // Find user with password field
      const user = await User.findOne({ email: admin.email.toLowerCase() }).select('+password');
      
      if (!user) {
        console.log('❌ User NOT FOUND - Creating...');
        const hashedPassword = await bcrypt.hash(admin.password, 10);
        const newUser = new User({
          email: admin.email.toLowerCase(),
          password: hashedPassword,
          name: admin.role.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
          role: admin.role,
          isStaff: true,
          isActive: true,
          permissions: ROLE_PERMISSIONS[admin.role] || []
        });
        await newUser.save();
        console.log('✅ User created successfully');
        continue;
      }

      console.log(`  ID: ${user._id}`);
      console.log(`  Role: ${user.role}`);
      console.log(`  isStaff: ${user.isStaff}`);
      console.log(`  isActive: ${user.isActive}`);
      console.log(`  Has password: ${!!user.password}`);
      console.log(`  Permissions: ${user.permissions?.length || 0} permissions`);

      // Check if password is valid
      if (user.password) {
        const isValid = await bcrypt.compare(admin.password, user.password);
        console.log(`  Password valid: ${isValid ? '✅ YES' : '❌ NO'}`);
        
        if (!isValid) {
          console.log('  🔧 Fixing password...');
          const hashedPassword = await bcrypt.hash(admin.password, 10);
          user.password = hashedPassword;
        }
      } else {
        console.log('  ❌ No password set - Setting...');
        const hashedPassword = await bcrypt.hash(admin.password, 10);
        user.password = hashedPassword;
      }

      // Fix isStaff if needed
      if (!user.isStaff) {
        console.log('  🔧 Setting isStaff to true...');
        user.isStaff = true;
      }

      // Fix isActive if needed
      if (!user.isActive) {
        console.log('  🔧 Setting isActive to true...');
        user.isActive = true;
      }

      // Fix role if needed
      if (user.role !== admin.role) {
        console.log(`  🔧 Fixing role from ${user.role} to ${admin.role}...`);
        user.role = admin.role;
      }

      // Fix permissions if needed
      if (!user.permissions || user.permissions.length === 0) {
        console.log('  🔧 Setting permissions...');
        user.permissions = ROLE_PERMISSIONS[admin.role] || [];
      }

      await user.save();
      console.log('  ✅ User verified/fixed');
    }

    console.log('\n\n========================================');
    console.log('Admin Credentials (use these to login):');
    console.log('========================================');
    ADMIN_CREDENTIALS.forEach(admin => {
      console.log(`  Email: ${admin.email}`);
      console.log(`  Password: ${admin.password}`);
      console.log(`  Role: ${admin.role}`);
      console.log('');
    });
    console.log('========================================');
    console.log('Login URL: /auth/admin');
    console.log('========================================\n');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

verifyAdmins();
