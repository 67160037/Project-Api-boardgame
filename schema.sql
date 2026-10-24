DROP DATABASE IF EXISTS boardgame_db;
CREATE DATABASE boardgame_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE boardgame_db;

-- บัญชีพนักงาน; สมัครผ่าน STAFF_SIGNUP_KEY และยืนยันด้วย session cookie
CREATE TABLE staff_users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(200) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- หมวดหมู่บอร์ดเกม
CREATE TABLE categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    UNIQUE KEY uq_category_name (name)
);

-- บอร์ดเกม (Resource หลัก)
CREATE TABLE boardgames (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    min_players INT NOT NULL,
    max_players INT NOT NULL,
    category_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_boardgame_category
        FOREIGN KEY (category_id) REFERENCES categories(id)
        ON DELETE RESTRICT,
    CONSTRAINT chk_players CHECK (min_players > 0 AND max_players >= min_players)
);

-- รีวิวของบอร์ดเกม (เขียนโดยลูกค้า)
CREATE TABLE reviews (
    id INT AUTO_INCREMENT PRIMARY KEY,
    boardgame_id INT NOT NULL,
    reviewer_name VARCHAR(100) NOT NULL,
    rating INT NOT NULL,
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_review_boardgame
        FOREIGN KEY (boardgame_id) REFERENCES boardgames(id)
        ON DELETE CASCADE,
    CONSTRAINT chk_rating CHECK (rating BETWEEN 1 AND 5)
);

-- ลูกค้า
CREATE TABLE customers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(150),
    UNIQUE KEY uq_customer_phone (phone)
);

-- การจองโต๊ะ
CREATE TABLE reservations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    reservation_date DATE NOT NULL,
    reservation_time TIME NOT NULL,
    party_size INT NOT NULL,
    status ENUM('pending', 'confirmed', 'cancelled') NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_reservation_customer
        FOREIGN KEY (customer_id) REFERENCES customers(id)
        ON DELETE CASCADE,
    CONSTRAINT chk_party_size CHECK (party_size > 0)
);

-- ตารางเชื่อม Many-to-Many ระหว่างการจองกับบอร์ดเกม
CREATE TABLE reservation_games (
    reservation_id INT NOT NULL,
    boardgame_id INT NOT NULL,
    PRIMARY KEY (reservation_id, boardgame_id),
    CONSTRAINT fk_resgame_reservation
        FOREIGN KEY (reservation_id) REFERENCES reservations(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_resgame_boardgame
        FOREIGN KEY (boardgame_id) REFERENCES boardgames(id)
        ON DELETE CASCADE
);

CREATE INDEX idx_boardgames_category ON boardgames(category_id);
CREATE INDEX idx_reviews_boardgame ON reviews(boardgame_id);
CREATE INDEX idx_reservations_customer ON reservations(customer_id);
CREATE INDEX idx_reservations_date ON reservations(reservation_date);
