const express = require('express');
const itemsDb = require('../db/items');

const router = express.Router();

router.get('/items', (req, res) => {
  const limit = req.query.limit;
  const sort = req.query.sort || 'created_at';

  const items = itemsDb.listItems({ limit, sort });
  res.json({ items });
});

module.exports = router;
