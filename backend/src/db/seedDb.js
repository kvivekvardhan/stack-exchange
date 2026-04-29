import { questions } from "../data/sampleData.js";
import { closePool, withTransaction } from "./pool.js";

function cleanDisplayName(value) {
  return String(value || "anonymous").trim() || "anonymous";
}

function normalizeTags(rawTags) {
  const tags = Array.isArray(rawTags)
    ? rawTags
    : String(rawTags || "")
        .split(",")
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean);
  return [...new Set(tags)].slice(0, 5);
}

function formatPostTags(tags) {
  if (!tags || tags.length === 0) {
    return null;
  }
  return tags.map((tag) => `<${tag}>`).join("");
}

function collectUsernames() {
  const names = new Set();
  questions.forEach((question) => {
    names.add(cleanDisplayName(question.askedBy));
    (question.answers || []).forEach((answer) => {
      names.add(cleanDisplayName(answer.author));
      (answer.replies || []).forEach((reply) => {
        names.add(cleanDisplayName(reply.author));
      });
    });
  });
  return [...names];
}

async function seedDb() {
  const usernames = collectUsernames();
  const userIdByName = new Map();
  const users = usernames.map((name, index) => {
    const id = 1000 + index + 1;
    userIdByName.set(name, id);
    return {
      id,
      displayName: name,
      reputation: 100 + index * 5
    };
  });

  const tagCounts = new Map();
  questions.forEach((question) => {
    const tags = normalizeTags(question.tags);
    tags.forEach((tag) => {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    });
  });

  await withTransaction(async (client) => {
    await client.query(
      "TRUNCATE comments, votes, posts, tags, users RESTART IDENTITY CASCADE"
    );

    for (const user of users) {
      await client.query(
        `
        INSERT INTO users (id, display_name, reputation, creation_date, last_access_date, views, upvotes, downvotes)
        VALUES ($1, $2, $3, NOW(), NOW(), 0, 0, 0)
        `,
        [user.id, user.displayName, user.reputation]
      );
    }

    for (const [tagName, count] of tagCounts.entries()) {
      await client.query(
        `
        INSERT INTO tags (tag_name, count, is_moderator_only, is_required)
        VALUES ($1, $2, false, false)
        ON CONFLICT (tag_name) DO UPDATE SET count = EXCLUDED.count
        `,
        [tagName, count]
      );
    }

    for (const question of questions) {
      const questionTags = normalizeTags(question.tags);
      const ownerDisplayName = cleanDisplayName(question.askedBy);
      const ownerUserId = userIdByName.get(ownerDisplayName) || null;
      const answerCount = (question.answers || []).length;

      await client.query(
        `
        INSERT INTO posts (
          id,
          post_type_id,
          creation_date,
          score,
          view_count,
          body,
          owner_user_id,
          owner_display_name,
          title,
          tags,
          answer_count,
          comment_count,
          favorite_count,
          content_license
        )
        VALUES ($1, 1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, 0, $11)
        `,
        [
          question.id,
          question.createdAt,
          question.score || 0,
          question.views || 0,
          question.body,
          ownerUserId,
          ownerDisplayName,
          question.title,
          formatPostTags(questionTags),
          answerCount,
          "CC BY-SA 4.0"
        ]
      );

      for (const answer of question.answers || []) {
        const answerOwner = cleanDisplayName(answer.author);
        const answerOwnerId = userIdByName.get(answerOwner) || null;
        const commentCount = (answer.replies || []).length;

        await client.query(
          `
          INSERT INTO posts (
            id,
            post_type_id,
            parent_id,
            creation_date,
            score,
            body,
            owner_user_id,
            owner_display_name,
            comment_count,
            content_license
          )
          VALUES ($1, 2, $2, $3, $4, $5, $6, $7, $8, $9)
          `,
          [
            answer.id,
            question.id,
            answer.createdAt,
            answer.score || 0,
            answer.body,
            answerOwnerId,
            answerOwner,
            commentCount,
            "CC BY-SA 4.0"
          ]
        );

        for (const reply of answer.replies || []) {
          const replyOwner = cleanDisplayName(reply.author);
          const replyOwnerId = userIdByName.get(replyOwner) || null;

          await client.query(
            `
            INSERT INTO comments (
              id,
              post_id,
              score,
              text,
              creation_date,
              user_display_name,
              user_id,
              content_license
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `,
            [
              reply.id,
              answer.id,
              reply.score || 0,
              reply.body,
              reply.createdAt,
              replyOwner,
              replyOwnerId,
              "CC BY-SA 4.0"
            ]
          );
        }
      }
    }

    await client.query(`
      SELECT setval(pg_get_serial_sequence('users', 'id'), COALESCE((SELECT MAX(id) FROM users), 1), true);
      SELECT setval(pg_get_serial_sequence('posts', 'id'), COALESCE((SELECT MAX(id) FROM posts), 1), true);
      SELECT setval(pg_get_serial_sequence('comments', 'id'), COALESCE((SELECT MAX(id) FROM comments), 1), true);
      SELECT setval(pg_get_serial_sequence('votes', 'id'), COALESCE((SELECT MAX(id) FROM votes), 1), true);
      SELECT setval(pg_get_serial_sequence('tags', 'id'), COALESCE((SELECT MAX(id) FROM tags), 1), true);
    `);
  });

  console.log(`Seeded ${questions.length} questions into Posts.`);
}

seedDb()
  .catch((error) => {
    console.error("Failed to seed database", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
