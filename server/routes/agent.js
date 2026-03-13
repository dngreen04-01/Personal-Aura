const express = require('express');
const { routeRequest } = require('../agents/router');
const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { message, history, userContext } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }

    const result = await routeRequest({ message, history, userContext });
    res.json(result);
  } catch (error) {
    console.error('Agent API Error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
