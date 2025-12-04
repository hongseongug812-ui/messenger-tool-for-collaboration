"""
기존 서버들의 채널에 owner를 members로 추가하는 스크립트
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os

# 환경변수 로드
try:
    from dotenv import load_dotenv
    load_dotenv()
except:
    pass

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
MONGO_DB = os.getenv("MONGO_DB", "work_messenger")

async def fix_servers():
    # MongoDB 연결
    client = AsyncIOMotorClient(MONGO_URI)
    db = client[MONGO_DB]
    servers_col = db["servers"]
    users_col = db["users"]

    print(f"MongoDB 연결: {MONGO_URI} / DB={MONGO_DB}")

    # 모든 서버 조회
    servers_cursor = servers_col.find({})
    updated_count = 0

    async for server_doc in servers_cursor:
        server_id = server_doc["_id"]
        server_name = server_doc.get("name", "Unknown")
        members = server_doc.get("members", [])

        print(f"\n서버 처리 중: {server_name} (ID: {server_id})")
        print(f"  서버 멤버 수: {len(members)}")

        if not members:
            print(f"  [!] 서버에 멤버가 없습니다. 건너뜁니다.")
            continue

        # 서버의 첫 번째 멤버를 owner로 간주
        owner = members[0]
        print(f"  Owner: {owner.get('name')} (ID: {owner.get('id')})")

        # 모든 카테고리와 채널을 순회
        categories = server_doc.get("categories", [])
        modified = False

        for cat in categories:
            for ch in cat.get("channels", []):
                channel_id = ch.get("id")
                channel_name = ch.get("name")
                channel_members = ch.get("members", [])

                # Owner가 이미 채널 멤버인지 확인
                owner_exists = any(m.get("id") == owner.get("id") for m in channel_members)

                if not owner_exists:
                    print(f"  [+] 채널 '{channel_name}'에 owner 추가")
                    channel_members.insert(0, owner)  # 맨 앞에 추가
                    ch["members"] = channel_members
                    modified = True
                else:
                    print(f"  [-] 채널 '{channel_name}'에 이미 owner 있음")

        # 서버 업데이트
        if modified:
            await servers_col.update_one(
                {"_id": server_id},
                {"$set": {"categories": categories}}
            )
            updated_count += 1
            print(f"  [OK] 서버 업데이트 완료")
        else:
            print(f"  [SKIP] 업데이트 필요 없음")

    print(f"\n\n{'='*60}")
    print(f"총 {updated_count}개 서버 업데이트 완료!")
    print(f"{'='*60}")

    client.close()

if __name__ == "__main__":
    asyncio.run(fix_servers())
