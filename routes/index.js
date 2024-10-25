const express = require('express');
const router = express.Router();
const { MongoClient, ObjectId } = require('mongodb');

// MongoDB connection configuration
const mongoUri = process.env.MONGOURL;
const dbName = 'gps_tracks';
console.log('MongoDB URI:', mongoUri); // Add this for debugging

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

    const activities = await db.collection('activities')
        .find({})
        .sort({ 'metadata.time': -1 })
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

// Get latest activity
router.get('/latest', validateMongoUri, async (req, res) => {
  let client;
  try {
    client = await getMongoClient();
    const db = client.db(dbName);

    const activity = await db.collection('activities')
        .findOne({}, { sort: { 'metadata.time': -1 } });

    if (!activity) {
      return res.status(404).json({ error: 'No activities found' });
    }

    res.json(activity);
  } catch (error) {
    console.error('Error fetching latest activity:', error);
    res.status(500).json({ error: `Internal server error: ${error.message}` });
  } finally {
    if (client) {
      await client.close();
    }
  }
});

// Get activity by ID
router.get('/:id', validateMongoUri, async (req, res) => {
  let client;
  try {
    const { id } = req.params;

    // Validate ObjectId format
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid activity ID format' });
    }

    client = await getMongoClient();
    const db = client.db(dbName);

    const activity = await db.collection('activities')
        .findOne({ _id: new ObjectId(id) });

    if (!activity) {
      return res.status(404).json({ error: 'Activity not found' });
    }

    res.json(activity);
  } catch (error) {
    console.error('Error fetching activity by ID:', error);
    res.status(500).json({ error: `Internal server error: ${error.message}` });
  } finally {
    if (client) {
      await client.close();
    }
  }
});

// Get activities by date range
router.get('/date-range', validateMongoUri, async (req, res) => {
  let client;
  try {
    const { startDate, endDate } = req.query;

    // Validate date parameters
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Both startDate and endDate are required' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    client = await getMongoClient();
    const db = client.db(dbName);

    const activities = await db.collection('activities')
        .find({
          'metadata.time': {
            $gte: start,
            $lte: end
          }
        })
        .sort({ 'metadata.time': -1 })
        .toArray();

    res.json(activities);
  } catch (error) {
    console.error('Error fetching activities by date range:', error);
    res.status(500).json({ error: `Internal server error: ${error.message}` });
  } finally {
    if (client) {
      await client.close();
    }
  }
});

// Get activities by type
router.get('/by-type/:type', validateMongoUri, async (req, res) => {
  let client;
  try {
    const { type } = req.params;

    if (!type || typeof type !== 'string') {
      return res.status(400).json({ error: 'Valid activity type is required' });
    }

    client = await getMongoClient();
    const db = client.db(dbName);

    const activities = await db.collection('activities')
        .find({
          'track.type': type
        })
        .sort({ 'metadata.time': -1 })
        .toArray();

    res.json(activities);
  } catch (error) {
    console.error('Error fetching activities by type:', error);
    res.status(500).json({ error: `Internal server error: ${error.message}` });
  } finally {
    if (client) {
      await client.close();
    }
  }
});

module.exports = router;