-- Active: 1786894670523@@127.0.0.1@3306@boardgame_db
USE boardgame_db;

INSERT INTO categories (name) VALUES
('วางแผน (Strategy)'),
('ปาร์ตี้ (Party)'),
('ครอบครัว (Family)');

INSERT INTO boardgames (name, min_players, max_players, category_id) VALUES
('Ticket to Ride', 2, 5, 1),
('Catan', 3, 4, 1),
('Codenames', 4, 8, 2);

INSERT INTO reviews (boardgame_id, reviewer_name, rating, comment) VALUES
(1, 'สมชาย', 5, 'เล่นง่าย เหมาะกับครอบครัว'),
(1, 'มานี', 4, 'สนุกดีแต่ใช้เวลานานไปหน่อย'),
(2, 'ปิติ', 5, 'คลาสสิกมาก แนะนำเลย');

INSERT INTO customers (name, phone, email) VALUES
('วีระ ใจดี', '0812345678', 'weera@example.com'),
('สุดา รักเกม', '0898765432', 'suda@example.com'),
('ชูใจ บอร์ดเกมเมอร์', '0865554321', NULL);

INSERT INTO reservations (customer_id, reservation_date, reservation_time, party_size, status) VALUES
(1, '2026-08-20', '18:00:00', 4, 'confirmed'),
(2, '2026-08-21', '19:30:00', 2, 'pending'),
(3, '2026-08-22', '17:00:00', 6, 'pending');

INSERT INTO reservation_games (reservation_id, boardgame_id) VALUES
(1, 1), (1, 2),
(2, 3),
(3, 1), (3, 3);