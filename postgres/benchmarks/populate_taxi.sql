CREATE TABLE IF NOT EXISTS taxi_trips (
    id SERIAL PRIMARY KEY,
    passenger_count INT,
    trip_distance FLOAT8,
    fare_amount FLOAT8,
    tip_amount FLOAT8,
    trip_date TIMESTAMP
);

TRUNCATE taxi_trips;

INSERT INTO taxi_trips (passenger_count, trip_distance, fare_amount, tip_amount, trip_date)
SELECT 
    (random() * 6 + 1)::int, 
    random() * 20, 
    random() * 50 + 5, 
    random() * 10, 
    NOW() - (random() * 1000 * interval '1 day')
FROM generate_series(1, 1000000);
