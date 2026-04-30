import xml.etree.ElementTree as ET
import psycopg2

def connect(port):
    if port == 5434:
        return psycopg2.connect(host='127.0.0.1', port=5432, database='stackfast', user='postgres')
    return psycopg2.connect(host='127.0.0.1', port=port, database='stackfast', user='kishan')

def load(port):
    conn = connect(port)
    cur = conn.cursor()
    print(f"\nLoading into port {port}...")

    print("Loading tags...")
    tree = ET.parse('/home/kishan/Desktop/dbis_project/askubuntu/Tags.xml')
    count = 0
    for row in tree.getroot().findall('row'):
        try:
            cur.execute("""
                INSERT INTO tags (id, tagname, count, excerptpostid, wikipostid)
                VALUES (%s, %s, %s, %s, %s) ON CONFLICT DO NOTHING
            """, (
                int(row.get('Id')),
                row.get('TagName', ''),
                int(row.get('Count', 0)),
                int(row.get('ExcerptPostId')) if row.get('ExcerptPostId') else None,
                int(row.get('WikiPostId')) if row.get('WikiPostId') else None
            ))
            count += 1
        except: pass
    conn.commit()
    print(f"Tags done: {count}")

    print("Loading posts...")
    tree = ET.parse('/home/kishan/Desktop/dbis_project/askubuntu/Posts.xml')
    count = 0
    for row in tree.getroot().findall('row'):
        try:
            cur.execute("""
                INSERT INTO posts (
                    id, posttypeid, acceptedanswerid, parentid,
                    creationdate, score, viewcount, body,
                    owneruserid, ownerdisplayname,
                    lasteditdate, lastactivitydate,
                    title, tags, answercount, commentcount,
                    favoritecount, contentlicense
                ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT DO NOTHING
            """, (
                int(row.get('Id')),
                int(row.get('PostTypeId', 1)),
                int(row.get('AcceptedAnswerId')) if row.get('AcceptedAnswerId') else None,
                int(row.get('ParentId')) if row.get('ParentId') else None,
                row.get('CreationDate', '2023-01-01')[:19],
                int(row.get('Score', 0)),
                int(row.get('ViewCount', 0)) if row.get('ViewCount') else 0,
                row.get('Body', ''),
                int(row.get('OwnerUserId')) if row.get('OwnerUserId') else None,
                row.get('OwnerDisplayName', ''),
                row.get('LastEditDate', None),
                row.get('LastActivityDate', None),
                row.get('Title', None),
                row.get('Tags', None),
                int(row.get('AnswerCount', 0)) if row.get('AnswerCount') else 0,
                int(row.get('CommentCount', 0)) if row.get('CommentCount') else 0,
                int(row.get('FavoriteCount', 0)) if row.get('FavoriteCount') else 0,
                row.get('ContentLicense', 'CC BY-SA 4.0')
            ))
            count += 1
            if count % 10000 == 0:
                conn.commit()
                print(f"  {count} posts...")
        except: pass
    conn.commit()
    print(f"Posts done: {count}")

    print("Loading comments...")
    tree = ET.parse('/home/kishan/Desktop/dbis_project/askubuntu/Comments.xml')
    count = 0
    for row in tree.getroot().findall('row'):
        try:
            cur.execute("""
                INSERT INTO comments (id, postid, score, text, creationdate, userdisplayname, userid)
                VALUES (%s,%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING
            """, (
                int(row.get('Id')),
                int(row.get('PostId')),
                int(row.get('Score', 0)),
                row.get('Text', ''),
                row.get('CreationDate', '2023-01-01')[:19],
                row.get('UserDisplayName', ''),
                int(row.get('UserId')) if row.get('UserId') else None
            ))
            count += 1
            if count % 10000 == 0:
                conn.commit()
                print(f"  {count} comments...")
        except: pass
    conn.commit()
    print(f"Comments done: {count}")

    cur.close()
    conn.close()
    print(f"Port {port} complete!")

load(5433)
load(5434)
print("\nAll done!")