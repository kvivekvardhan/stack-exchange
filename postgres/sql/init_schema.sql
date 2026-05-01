-- StackFast canonical schema (Stack Overflow style).
-- This is the new vectorized target — Posts replaces se_posts.
-- Apply to BOTH the baseline (5434) and vectorized (5433) databases:
--   psql -h 127.0.0.1 -p 5434 -d stackfast -f /path/to/init_schema.sql
--   psql -h 127.0.0.1 -p 5433 -d stackfast -f /path/to/init_schema.sql

DROP TABLE IF EXISTS PostHistory CASCADE;
DROP TABLE IF EXISTS PostLinks   CASCADE;
DROP TABLE IF EXISTS Tags        CASCADE;
DROP TABLE IF EXISTS Badges      CASCADE;
DROP TABLE IF EXISTS Votes       CASCADE;
DROP TABLE IF EXISTS Comments    CASCADE;
DROP TABLE IF EXISTS Posts       CASCADE;
DROP TABLE IF EXISTS Users       CASCADE;
DROP TABLE IF EXISTS se_posts    CASCADE;

CREATE TABLE Users (
    Id INT PRIMARY KEY,
    Reputation INT NOT NULL,
    CreationDate TIMESTAMP NOT NULL,
    DisplayName VARCHAR(255) NOT NULL,
    LastAccessDate TIMESTAMP NOT NULL,
    WebsiteUrl VARCHAR(512),
    Location VARCHAR(512),
    AboutMe TEXT,
    Views INT DEFAULT 0,
    UpVotes INT DEFAULT 0,
    DownVotes INT DEFAULT 0,
    AccountId INT,
    ProfileImageUrl VARCHAR(512)
);

CREATE TABLE Posts (
    Id INT PRIMARY KEY,
    PostTypeId INT NOT NULL,
    AcceptedAnswerId INT,
    ParentId INT,
    CreationDate TIMESTAMP NOT NULL,
    Score INT DEFAULT 0,
    ViewCount INT,
    Body TEXT NOT NULL,
    OwnerUserId INT,
    OwnerDisplayName VARCHAR(255),
    LastEditorUserId INT,
    LastEditorDisplayName VARCHAR(255),
    LastEditDate TIMESTAMP,
    LastActivityDate TIMESTAMP,
    Title VARCHAR(512),
    Tags VARCHAR(512),
    AnswerCount INT DEFAULT 0,
    CommentCount INT DEFAULT 0,
    FavoriteCount INT DEFAULT 0,
    ClosedDate TIMESTAMP,
    CommunityOwnedDate TIMESTAMP,
    ContentLicense VARCHAR(64) NOT NULL
);

CREATE TABLE Comments (
    Id INT PRIMARY KEY,
    PostId INT NOT NULL,
    Score INT DEFAULT 0,
    Text TEXT NOT NULL,
    CreationDate TIMESTAMP NOT NULL,
    UserId INT,
    UserDisplayName VARCHAR(255),
    ContentLicense VARCHAR(64) NOT NULL
);

CREATE TABLE Votes (
    Id INT PRIMARY KEY,
    PostId INT NOT NULL,
    VoteTypeId INT NOT NULL,
    UserId INT,
    CreationDate TIMESTAMP NOT NULL,
    BountyAmount INT
);

CREATE TABLE Badges (
    Id INT PRIMARY KEY,
    UserId INT NOT NULL,
    Name VARCHAR(255) NOT NULL,
    Date TIMESTAMP NOT NULL,
    Class INT NOT NULL,
    TagBased BOOLEAN DEFAULT FALSE
);

CREATE TABLE Tags (
    Id INT PRIMARY KEY,
    TagName VARCHAR(255) NOT NULL,
    Count INT DEFAULT 0,
    ExcerptPostId INT,
    WikiPostId INT
);

CREATE TABLE PostLinks (
    Id INT PRIMARY KEY,
    CreationDate TIMESTAMP NOT NULL,
    PostId INT NOT NULL,
    RelatedPostId INT NOT NULL,
    LinkTypeId INT NOT NULL
);

CREATE TABLE PostHistory (
    Id INT PRIMARY KEY,
    PostHistoryTypeId INT NOT NULL,
    PostId INT NOT NULL,
    RevisionGUID UUID,
    CreationDate TIMESTAMP NOT NULL,
    UserId INT,
    UserDisplayName VARCHAR(255),
    Comment TEXT,
    Text TEXT,
    ContentLicense VARCHAR(64)
);
