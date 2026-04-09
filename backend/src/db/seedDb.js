import { questions, tagCatalog } from "../data/sampleData.js";
import { closePool, withTransaction } from "./pool.js";

function cleanAuthor(value) {
  return String(value || "anonymous").trim() || "anonymous";
}

async function seedDb() {
  const catalogDescriptions = new Map(
    tagCatalog.map((item) => [item.name.toLowerCase(), item.description || "No description available"])
  );

  await withTransaction(async (client) => {
    await client.query(
      "TRUNCATE question_tags, replies, answers, questions, tags RESTART IDENTITY CASCADE"
    );

    for (const catalogItem of tagCatalog) {
      const tagName = String(catalogItem.name || "").trim().toLowerCase();
      if (!tagName) {
        continue;
      }

      await client.query(
        `
        INSERT INTO tags (name, description)
        VALUES ($1, $2)
        ON CONFLICT (name) DO UPDATE
          SET description = EXCLUDED.description
        `,
        [tagName, catalogItem.description || "No description available"]
      );
    }

    for (const question of questions) {
      await client.query(
        `
        INSERT INTO questions (id, title, body, asked_by, score, views, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [
          question.id,
          question.title,
          question.body,
          cleanAuthor(question.askedBy),
          question.score || 0,
          question.views || 0,
          question.createdAt
        ]
      );

      for (const rawTag of question.tags || []) {
        const tagName = String(rawTag || "").trim().toLowerCase();
        if (!tagName) {
          continue;
        }

        const description =
          catalogDescriptions.get(tagName) || `Community tag for ${tagName}`;

        const tagResult = await client.query(
          `
          INSERT INTO tags (name, description)
          VALUES ($1, $2)
          ON CONFLICT (name) DO UPDATE
            SET description = tags.description
          RETURNING id
          `,
          [tagName, description]
        );

        const tagId = tagResult.rows[0].id;

        await client.query(
          `
          INSERT INTO question_tags (question_id, tag_id)
          VALUES ($1, $2)
          ON CONFLICT (question_id, tag_id) DO NOTHING
          `,
          [question.id, tagId]
        );
      }

      for (const answer of question.answers || []) {
        await client.query(
          `
          INSERT INTO answers (id, question_id, author, score, body, created_at)
          VALUES ($1, $2, $3, $4, $5, $6)
          `,
          [
            answer.id,
            question.id,
            cleanAuthor(answer.author),
            answer.score || 0,
            answer.body,
            answer.createdAt
          ]
        );

        for (const reply of answer.replies || []) {
          await client.query(
            `
            INSERT INTO replies (id, answer_id, author, score, body, created_at)
            VALUES ($1, $2, $3, $4, $5, $6)
            `,
            [
              reply.id,
              answer.id,
              cleanAuthor(reply.author),
              reply.score || 0,
              reply.body,
              reply.createdAt
            ]
          );
        }
      }
    }

    await client.query(`
      SELECT setval(pg_get_serial_sequence('questions', 'id'), COALESCE((SELECT MAX(id) FROM questions), 1), true);
      SELECT setval(pg_get_serial_sequence('answers', 'id'), COALESCE((SELECT MAX(id) FROM answers), 1), true);
      SELECT setval(pg_get_serial_sequence('replies', 'id'), COALESCE((SELECT MAX(id) FROM replies), 1), true);
      SELECT setval(pg_get_serial_sequence('tags', 'id'), COALESCE((SELECT MAX(id) FROM tags), 1), true);
    `);
  });

  console.log(`Seeded ${questions.length} questions.`);
}

seedDb()
  .catch((error) => {
    console.error("Failed to seed database", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
