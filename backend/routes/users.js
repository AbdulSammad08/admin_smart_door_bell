const express = require('express');
const User = require('../models/User');
const Transfer = require('../models/Transfer');
const Subscription = require('../models/Subscription');
const auth = require('../middleware/auth');
const dbCheck = require('../middleware/dbCheck');

const router = express.Router();

// Test endpoint without auth
router.get('/test', dbCheck, async (req, res) => {
  try {
    const userCount = await User.countDocuments();
    res.json({ message: 'API working', userCount });
  } catch (error) {
    res.status(500).json({ message: 'Database error', error: error.message });
  }
});

// Test endpoint to get users without auth
router.get('/test-data', dbCheck, async (req, res) => {
  try {
    const users = await User.find().limit(5);
    const usersData = users.map(user => ({
      _id: user._id,
      name: user.name,
      email: user.email,
      secondaryUsers: user.secondaryUsers ? user.secondaryUsers.length : 0
    }));
    res.json({ users: usersData });
  } catch (error) {
    res.status(500).json({ message: 'Database error', error: error.message });
  }
});

// Get all users with aggregated data
router.get('/', auth, dbCheck, async (req, res) => {
  console.log('Users API called, admin:', req.admin?.email);
  try {
    const { search, page = 1, limit = 10 } = req.query;
    let query = {};

    if (search) {
      query = {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ]
      };
    }

    const users = await User.find(query)
      .populate('subscriptionId')
      .limit(limit * 1)
      .skip((page - 1) * limit);

    // Get transfer data for each user
    console.log('Found users:', users.length);
    
    const usersWithData = await Promise.all(users.map(async (user) => {
      const transfers = await Transfer.find({ fromUser: user._id });
      const latestTransfer = transfers.length > 0 ? transfers[transfers.length - 1] : null;
      
      return {
        _id: user._id,
        name: user.name,
        email: user.email,
        isVerified: user.isVerified,
        status: user.status || 'Active',
        secondaryUsers: user.secondaryUsers ? user.secondaryUsers.length : 0,
        beneficiaryAllotted: user.subscriptionId ? 'Yes' : 'No',
        ownershipTransfer: latestTransfer ? latestTransfer.status : 'Not Requested',
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        lastLogin: user.lastLogin
      };
    }));
    
    console.log('Processed users data:', usersWithData.length);

    const total = await User.countDocuments(query);

    res.json({
      users: usersWithData,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get user by ID
router.get('/:id', auth, dbCheck, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).populate('subscriptionId');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get user details with related data
router.get('/:id/details', auth, dbCheck, async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const SecondaryOwnership = require('../models/SecondaryOwnership');
    const OwnershipTransfer = require('../models/OwnershipTransfer');
    const BeneficialAllotment = require('../models/BeneficialAllotment');
    
    const user = await User.findById(req.params.id).populate('subscriptionId');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Get active subscription from payments
    const db = mongoose.connection.db;
    const activeSubscription = await db.collection('payments').findOne({ 
      userName: user.name, 
      __v: 1 
    });

    // Get related data
    const secondaryOwnerships = await SecondaryOwnership.find({ userId: req.params.id });
    const ownershipTransfers = await OwnershipTransfer.find({ userId: req.params.id });
    const beneficialAllotments = await BeneficialAllotment.find({ userId: req.params.id });

    res.json({
      user,
      activeSubscription,
      secondaryOwnerships,
      ownershipTransfers,
      beneficialAllotments
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update user
router.put('/:id', auth, dbCheck, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete user
router.delete('/:id', auth, dbCheck, async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;