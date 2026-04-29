#!/bin/bash
curl -s -X POST http://localhost:4000/inspect \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT COUNT(*) FROM taxi_trips"}' | python3 -m json.tool | head -40
