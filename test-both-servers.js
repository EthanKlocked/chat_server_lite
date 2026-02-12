const { io } = require("socket.io-client");

const USER1_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6ImV0aGFua2xvY2tlZEBnbWFpbC5jb20iLCJpZCI6IjY3NTE2NmExNTg3OWI2ZGYzOGJhMjBmNSIsImlhdCI6MTc2ODgxNjE2MiwiZXhwIjoyMTI4ODE2MTYyfQ.GexpZES2gRfP2rCOYjAvq3hmdmHjJ3dSX9kHFvnQ_J4";
const USER1_ID = "675166a15879b6df38ba20f5";

const USER2_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6IndubHdubDIwMDNAbmF2ZXIuY29tIiwiaWQiOiI2NzRlY2QzYTEzYmZlNGEyZjgyMmNlYTgiLCJpYXQiOjE3Njg4MTY0ODQsImV4cCI6MjEyODgxNjQ4NH0.zWXRFe4iMK3Ii1DHsZMUhUZQqOFzcfkLiLYFhV9SBps";
const USER2_ID = "674ecd3a13bfe4a2f822cea8";

const USER3_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6InNvYWZ0aGV3b3JsZEBnbWFpbC5jb20iLCJpZCI6IjY3OGJjNjI0MWEzYzNkYmVjZjhkNmY4NSIsImlhdCI6MTc2ODg4MzkxOCwiZXhwIjoyMTI4ODgzOTE4fQ.55hJ_wflqQ7o_fpDqwhwoC3yWh9cCaAah90s5-Qf3Vw";
const USER3_ID = "678bc6241a3c3dbecf8d6f85";

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTest(serverName, port) {
  console.log(`\n${"═".repeat(70)}`);
  console.log(`  ${serverName} SERVER TEST (Port ${port})`);
  console.log(`${"═".repeat(70)}`);

  const results = {};
  const timings = {};
  const testStart = Date.now();

  // Connect User1
  console.log("\n[1] Connecting User1...");
  let t0 = Date.now();
  const socket1 = io(`http://localhost:${port}`, {
    extraHeaders: { token: USER1_TOKEN },
    transports: ["websocket"],
  });

  await new Promise((resolve) => {
    socket1.on("connect", () => {
      timings.connect = Date.now() - t0;
      console.log("    User1 Connected:", socket1.id, `(${timings.connect}ms)`);
      results.user1Connected = true;
      resolve();
    });
    socket1.on("connect_error", (err) => {
      console.log("    User1 Connection Error:", err.message);
      results.user1Connected = false;
      resolve();
    });
    setTimeout(() => resolve(), 3000);
  });

  if (!results.user1Connected) {
    console.log("\n    Connection failed. Skipping remaining tests.");
    return { serverName, port, results, passed: false };
  }

  await sleep(500);

  // Test: initializeChat (1:1)
  console.log("\n[2] Testing initializeChat (1:1 with User2)...");
  t0 = Date.now();
  await new Promise((resolve) => {
    socket1.once("roomMembers", (data) => {
      timings.initializeChat = Date.now() - t0;
      const roomId = data.roomId || data.room_id;
      results.roomId = roomId;
      console.log("    roomMembers received, roomId:", roomId, `(${timings.initializeChat}ms)`);
      resolve();
    });
    socket1.once("error", (err) => {
      console.log("    Error:", err);
      resolve();
    });
    socket1.emit("initializeChat", { participants: [USER2_ID] });
    setTimeout(() => {
      if (!results.roomId) console.log("    Timeout");
      resolve();
    }, 3000);
  });

  await sleep(500);

  // Test: getChatList
  console.log("\n[3] Testing getChatList...");
  t0 = Date.now();
  await new Promise((resolve) => {
    socket1.once("chatList", (data) => {
      timings.getChatList = Date.now() - t0;
      const list = Array.isArray(data) ? data : [data];
      results.chatListCount = list.length;
      console.log("    chatList received, count:", list.length, `(${timings.getChatList}ms)`);
      resolve();
    });
    socket1.emit("getChatList");
    setTimeout(() => resolve(), 3000);
  });

  await sleep(500);

  // Test: enterChat
  if (results.roomId) {
    console.log("\n[4] Testing enterChat...");
    t0 = Date.now();
    await new Promise((resolve) => {
      socket1.once("chatHistory", (data) => {
        timings.enterChat = Date.now() - t0;
        const messages = Array.isArray(data) ? data.length : 0;
        results.enterChat = true;
        console.log("    chatHistory received, messages:", messages, `(${timings.enterChat}ms)`);
        resolve();
      });
      socket1.emit("enterChat", { roomId: results.roomId });
      setTimeout(() => resolve(), 3000);
    });
  }

  await sleep(500);

  // Connect User2
  console.log("\n[5] Connecting User2...");
  const socket2 = io(`http://localhost:${port}`, {
    extraHeaders: { token: USER2_TOKEN },
    transports: ["websocket"],
  });

  await new Promise((resolve) => {
    socket2.on("connect", () => {
      console.log("    User2 Connected:", socket2.id);
      results.user2Connected = true;
      resolve();
    });
    setTimeout(() => resolve(), 3000);
  });

  await sleep(500);

  // User2 enters chat
  if (results.roomId && results.user2Connected) {
    console.log("\n[6] User2 entering chat...");
    await new Promise((resolve) => {
      socket2.once("chatHistory", () => {
        console.log("    User2 entered chat");
        resolve();
      });
      socket2.emit("enterChat", { roomId: results.roomId });
      setTimeout(() => resolve(), 2000);
    });
  }

  await sleep(500);

  // Test: sendMessage
  if (results.roomId) {
    console.log("\n[7] Testing sendMessage...");
    t0 = Date.now();
    await new Promise((resolve) => {
      socket2.once("newMessage", (msg) => {
        timings.sendMessage = Date.now() - t0;
        console.log("    User2 received newMessage", `(${timings.sendMessage}ms)`);
        console.log("    content:", msg.content);
        results.messageReceived = true;
        resolve();
      });
      socket1.emit("sendMessage", {
        roomId: results.roomId,
        type: "text",
        content: [`Test message from ${serverName}`]
      });
      setTimeout(() => {
        if (!results.messageReceived) console.log("    Timeout - no message received");
        resolve();
      }, 3000);
    });
  }

  await sleep(500);

  // Connect User3
  console.log("\n[8] Connecting User3...");
  const socket3 = io(`http://localhost:${port}`, {
    extraHeaders: { token: USER3_TOKEN },
    transports: ["websocket"],
  });

  await new Promise((resolve) => {
    socket3.on("connect", () => {
      console.log("    User3 Connected:", socket3.id);
      results.user3Connected = true;
      resolve();
    });
    setTimeout(() => resolve(), 3000);
  });

  await sleep(500);

  // Test: Group Chat (3 members)
  console.log("\n[9] Testing Group Chat (3 members)...");
  await new Promise((resolve) => {
    let gotRoomMembers = false;
    let gotChatList = false;

    const checkDone = () => {
      if (gotRoomMembers && gotChatList) resolve();
    };

    socket1.once("roomMembers", (data) => {
      const roomId = data.roomId || data.room_id;
      results.groupRoomId = roomId;
      console.log("    Group chat created, roomId:", roomId);
      gotRoomMembers = true;
      checkDone();
    });

    const chatListHandler = (data) => {
      const list = Array.isArray(data) ? data : [data];
      if (list.length >= 2) {
        socket1.off("chatList", chatListHandler);
        console.log("    chatList updated with", list.length, "items");
        gotChatList = true;
        checkDone();
      }
    };
    socket1.on("chatList", chatListHandler);

    socket1.emit("initializeChat", { participants: [USER2_ID, USER3_ID] });
    setTimeout(() => {
      socket1.off("chatList", chatListHandler);
      if (!gotRoomMembers) console.log("    Timeout - no roomMembers");
      if (!gotChatList) console.log("    Timeout - no updated chatList");
      resolve();
    }, 3000);
  });

  await sleep(500);

  // Verify group chat
  if (results.groupRoomId) {
    console.log("\n[10] Verifying group chat in list...");
    await new Promise((resolve) => {
      const handler = (data) => {
        const list = Array.isArray(data) ? data : [data];
        if (list.length >= 2) {
          socket1.off("chatList", handler);
          const groupChat = list.find(c => c.roomId === results.groupRoomId);
          if (groupChat && groupChat.isGroupChat === true) {
            console.log("    Group chat verified: isGroupChat=true, memberCount=", groupChat.memberCount);
            results.groupChatVerified = true;
          } else {
            console.log("    Group chat NOT verified");
          }
          resolve();
        }
      };
      socket1.on("chatList", handler);
      socket1.emit("getChatList");
      setTimeout(() => {
        socket1.off("chatList", handler);
        resolve();
      }, 3000);
    });
  }

  // Cleanup
  socket1.disconnect();
  socket2.disconnect();
  socket3.disconnect();

  // Calculate pass/fail
  const allPassed =
    results.user1Connected &&
    results.user2Connected &&
    results.user3Connected &&
    results.roomId &&
    results.chatListCount > 0 &&
    results.enterChat &&
    results.messageReceived &&
    results.groupRoomId &&
    results.groupChatVerified;

  timings.total = Date.now() - testStart;
  console.log(`\n  Total test time: ${timings.total}ms`);

  return { serverName, port, results, timings, passed: allPassed };
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════════╗");
  console.log("║           NESTJS vs RUST SERVER COMPARISON TEST                  ║");
  console.log("╚══════════════════════════════════════════════════════════════════╝");

  const testResults = [];

  // Test NestJS server (port 3003)
  const nestResult = await runTest("NestJS", 3003);
  testResults.push(nestResult);

  // Flush Redis between tests
  console.log("\n\n>>> Flushing Redis between tests...");
  const { exec } = require("child_process");
  await new Promise((resolve) => {
    exec("redis-cli FLUSHALL", (err) => {
      if (err) console.log("    Warning: Could not flush Redis");
      else console.log("    Redis flushed successfully");
      resolve();
    });
  });

  await sleep(1000);

  // Test Rust server (port 3004)
  const rustResult = await runTest("Rust", 3004);
  testResults.push(rustResult);

  // Final Summary
  console.log("\n\n");
  console.log("╔══════════════════════════════════════════════════════════════════╗");
  console.log("║                      FINAL COMPARISON                            ║");
  console.log("╚══════════════════════════════════════════════════════════════════╝");
  console.log("");

  const headers = ["Test", "NestJS", "Rust"];
  const tests = [
    ["User1 Connected", nestResult.results.user1Connected, rustResult.results.user1Connected],
    ["User2 Connected", nestResult.results.user2Connected, rustResult.results.user2Connected],
    ["User3 Connected", nestResult.results.user3Connected, rustResult.results.user3Connected],
    ["1:1 Chat Created", !!nestResult.results.roomId, !!rustResult.results.roomId],
    ["Chat List Works", nestResult.results.chatListCount > 0, rustResult.results.chatListCount > 0],
    ["Enter Chat Works", nestResult.results.enterChat, rustResult.results.enterChat],
    ["Message Received", nestResult.results.messageReceived, rustResult.results.messageReceived],
    ["Group Chat Created", !!nestResult.results.groupRoomId, !!rustResult.results.groupRoomId],
    ["Group Chat Verified", nestResult.results.groupChatVerified, rustResult.results.groupChatVerified],
  ];

  console.log(`  ${"Test".padEnd(25)} ${"NestJS".padEnd(10)} ${"Rust".padEnd(10)}`);
  console.log(`  ${"-".repeat(25)} ${"-".repeat(10)} ${"-".repeat(10)}`);

  for (const [test, nest, rust] of tests) {
    const nestIcon = nest ? "✅" : "❌";
    const rustIcon = rust ? "✅" : "❌";
    console.log(`  ${test.padEnd(25)} ${nestIcon.padEnd(10)} ${rustIcon.padEnd(10)}`);
  }

  console.log("");
  console.log(`  ${"-".repeat(47)}`);
  console.log(`  ${"OVERALL".padEnd(25)} ${nestResult.passed ? "✅ PASS" : "❌ FAIL"}    ${rustResult.passed ? "✅ PASS" : "❌ FAIL"}`);
  console.log("");

  if (nestResult.passed && rustResult.passed) {
    console.log("  🎉 Both servers behave identically!");
  } else {
    console.log("  ⚠️  Servers have different behavior!");
  }

  // Performance comparison
  console.log("");
  console.log("╔══════════════════════════════════════════════════════════════════╗");
  console.log("║                    PERFORMANCE COMPARISON                        ║");
  console.log("╚══════════════════════════════════════════════════════════════════╝");
  console.log("");

  const perfTests = [
    ["Connect", nestResult.timings?.connect, rustResult.timings?.connect],
    ["Initialize Chat", nestResult.timings?.initializeChat, rustResult.timings?.initializeChat],
    ["Get Chat List", nestResult.timings?.getChatList, rustResult.timings?.getChatList],
    ["Enter Chat", nestResult.timings?.enterChat, rustResult.timings?.enterChat],
    ["Send Message", nestResult.timings?.sendMessage, rustResult.timings?.sendMessage],
    ["Total Test Time", nestResult.timings?.total, rustResult.timings?.total],
  ];

  console.log(`  ${"Operation".padEnd(20)} ${"NestJS".padStart(10)} ${"Rust".padStart(10)} ${"Diff".padStart(12)}`);
  console.log(`  ${"-".repeat(20)} ${"-".repeat(10)} ${"-".repeat(10)} ${"-".repeat(12)}`);

  for (const [op, nest, rust] of perfTests) {
    const nestStr = nest ? `${nest}ms` : "N/A";
    const rustStr = rust ? `${rust}ms` : "N/A";
    let diffStr = "";
    if (nest && rust) {
      const diff = rust - nest;
      const pct = ((diff / nest) * 100).toFixed(0);
      if (diff < 0) {
        diffStr = `${diff}ms (${pct}%)`;
      } else {
        diffStr = `+${diff}ms (+${pct}%)`;
      }
    }
    console.log(`  ${op.padEnd(20)} ${nestStr.padStart(10)} ${rustStr.padStart(10)} ${diffStr.padStart(12)}`);
  }

  console.log("");
  if (nestResult.timings?.total && rustResult.timings?.total) {
    const speedup = (nestResult.timings.total / rustResult.timings.total).toFixed(2);
    if (rustResult.timings.total < nestResult.timings.total) {
      console.log(`  🚀 Rust is ${speedup}x faster overall!`);
    } else {
      console.log(`  📊 NestJS is ${(1/speedup).toFixed(2)}x faster overall`);
    }
  }
  console.log("");
}

main().catch(console.error);
