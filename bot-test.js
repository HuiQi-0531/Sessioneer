// bot-test.js
const OLLAMA_URL = 'http://localhost:11434/api/chat';

// 描述你有哪些"工具"给模型用
const tools = [
  {
    type: 'function',
    function: {
      name: 'create_session',
      description: '在指定unit创建一个新的session',
      parameters: {
        type: 'object',
        properties: {
          unitCode: { type: 'string', description: 'unit代码,例如CAB201' },
          day: { type: 'string', description: '星期几,例如Monday' },
          time: { type: 'string', description: '时间,例如14:00' }
        },
        required: ['unitCode', 'day', 'time']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_unsubmitted_tutors',
      description: '查询哪些tutor还没交availability',
      parameters: {
        type: 'object',
        properties: {
          unitCode: { type: 'string', description: 'unit代码,例如CAB201' }
        },
        required: ['unitCode']
      }
    }
  }
];

// 真正执行动作的函数(以后这里要换成调用你的sessionsAPI/availabilityAPI)
async function executeTool(name, args) {
  if (name === 'create_session') {
    console.log('✅ [模拟] 正在创建session:', args);
    // 以后这里换成: await sessionsAPI.create(args)
    return { success: true, message: `已创建 ${args.unitCode} ${args.day} ${args.time} 的session` };
  }
  if (name === 'list_unsubmitted_tutors') {
    console.log('✅ [模拟] 正在查询未交availability的tutor:', args);
    // 以后这里换成: await availabilityAPI.getUnsubmitted(args.unitCode)
    return { success: true, tutors: ['Yu Yang Liu', 'John Wick'] };
  }
  return { success: false, message: '未知的操作' };
}

async function askBot(userMessage) {
  const res = await fetch(OLLAMA_URL, {
    method: 'POST',
    body: JSON.stringify({
      model: 'qwen2.5:7b',
      messages: [{ role: 'user', content: userMessage }],
      tools,
      stream: false
    })
  });

  const data = await res.json();
  const msg = data.message;

  // 如果模型决定要调用工具
  if (msg.tool_calls && msg.tool_calls.length > 0) {
    for (const call of msg.tool_calls) {
      const result = await executeTool(call.function.name, call.function.arguments);
      console.log('👉 执行结果:', result);
    }
  } else {
    // 模型只是聊天,没有调用工具
    console.log('🤖 Bot说:', msg.content);
  }
}

// 测试几句话
askBot('CAB201有哪些tutor还没交availability');