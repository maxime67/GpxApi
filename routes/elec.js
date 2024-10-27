const express = require('express');
const router = express.Router();
const { MongoClient, ObjectId } = require('mongodb');

// MongoDB connection configuration
const mongoUri = process.env.MONGOURL;
const dbName = 'elec';

// Middleware to validate MongoDB connection string
const validateMongoUri = (req, res, next) => {
    if (!mongoUri || typeof mongoUri !== 'string') {
        return res.status(500).json({ error: 'Invalid MongoDB connection configuration' });
    }
    next();
};

// Reusable MongoDB connection function
async function getMongoClient() {
    try {
        const client = await MongoClient.connect(mongoUri, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        return client;
    } catch (error) {
        throw new Error(`MongoDB connection failed: ${error.message}`);
    }
}

// Get all activities
router.get('/', validateMongoUri, async (req, res) => {
    let client;
    try {
        client = await getMongoClient();
        const db = client.db(dbName);

        const activities = await db.collection('points')
            .find({})
            .limit(500)
            .toArray();

        res.json(activities);
    } catch (error) {
        console.error('Error fetching all activities:', error);
        res.status(500).json({ error: `Internal server error: ${error.message}` });
    } finally {
        if (client) {
            await client.close();
        }
    }
});

module.exports = router;