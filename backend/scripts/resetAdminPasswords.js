/**
 * Reset Admin Passwords
 * Run this script to reset passwords for existing admin accounts
 * 
 * Usage: node scripts/resetAdminPasswords.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hushryd';

const ADMIN_CREDENTIALS = [
  { email: 'superadmin@hushryd.com', password: 'SuperAdmin@123' },
  { email: 'admin@hushryd.com', password: 'Admin@123' },
  { email: 'operations@hushryd.com', password: 'Operations@123' },
  { email: 'support@hushryd.com', password: 'Support@123' },
  { email: 'finance@hushryd.com', password: 'Finance@123' }
];

async function resetPasswords() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    const User = require('../src/models/User');

    for (const admin of ADMIN_CREDENTIALS) {
      const user = await User.findOne({ email: admin.email.toLowerCase() });
      
      if (!user) {
        console.log(`⚠️  User not found: ${admin.email}`);
        continue;
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(admin.password, 10);
      
      // Update password and ensure isStaff is true
      await User.updateOne(
        { _id: user._id },
        { 
          $set: { 
            password: hashedPassword,
            isStaff: true,
            isActive: true
          }
        }
      );
      
      console.log(`✅ Password reset for: ${admin.email}`);
    }

    console.log('\n========================================');
    console.log('Updated Admin Credentials:');
    console.log('========================================');
    ADMIN_CREDENTIALS.forEach(admin => {
      console.log(`  Email: ${admin.email}`);
      console.log(`  Password: ${admin.password}`);
      console.log('');
    });
    console.log('========================================');
    console.log('Login URL: /auth/admin');
    console.log('========================================\n');

  } catch (error) {
    console.error('Error resetting passwords:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

resetPasswords();
