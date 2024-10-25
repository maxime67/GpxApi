const express = require('express');
const router = express.Router();
const { MongoClient, ObjectId } = require('mongodb');

// MongoDB connection configuration
const mongoUri = 'mongodb://localhost:27017';
const dbName = 'gps_tracks';


// Get all activities
router.get('/', async (req, res) => {
  let client;
  try {
    client = await MongoClient.connect(mongoUri);
    const db = client.db(dbName);

    const activities = await db.collection('activities')
        .find({})
        .sort({ 'metadata.time': -1 })
        .toArray();


    res.json(activities);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error' + error });
  } finally {
    if (client) {
      await client.close();
    }
  }
});

// Get latest activity
router.get('/latest', async (req, res) => {
  let client;
  try {
    client = await MongoClient.connect(mongoUri);
    const db = client.db(dbName);

    const activity = await db.collection('activities')
        .findOne({}, { sort: { 'metadata.time': -1 } });

    if (!activity) {
      return res.status(404).json({ error: 'No activities found' });
    }

    res.json(activity);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (client) {
      await client.close();
    }
  }
});

// Get activity by ID
router.get('/:id', async (req, res) => {
  let client;
  try {
    client = await MongoClient.connect(mongoUri);
    const db = client.db(dbName);

    const activity = await db.collection('activities')
        .findOne({ _id: new ObjectId(req.params.id) });

    if (!activity) {
      return res.status(404).json({ error: 'Activity not found' });
    }

    res.json(activity);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (client) {
      await client.close();
    }
  }
});

// Get activities by date range
router.get('/date-range', async (req, res) => {
  let client;
  try {
    const { startDate, endDate } = req.query;
    client = await MongoClient.connect(mongoUri);
    const db = client.db(dbName);

    const activities = await db.collection('activities')
        .find({
          'metadata.time': {
            $gte: new Date(startDate),
            $lte: new Date(endDate)
          }
        })
        .sort({ 'metadata.time': -1 })
        .toArray();

    res.json(activities);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (client) {
      await client.close();
    }
  }
});

// Get activities by type
router.get('/by-type/:type', async (req, res) => {
  let client;
  try {
    client = await MongoClient.connect(mongoUri);
    const db = client.db(dbName);

    const activities = await db.collection('activities')
        .find({
          'track.type': req.params.type
        })
        .sort({ 'metadata.time': -1 })
        .toArray();

    res.json(activities);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (client) {
      await client.close();
    }
  }
});

module.exports = router;