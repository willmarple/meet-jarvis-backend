# ElevenLabs Tool Integration Implementation Plan
## Research Complete - Ready for Implementation

---

## 🔍 **Research Findings Summary**

### **✅ Correct Implementation Pattern**
Based on @elevenlabs/react documentation and Perplexity research:

```typescript
const conversation = useConversation({
  clientTools: {
    search_meeting_knowledge: async (parameters: { query: string, content_type?: string, limit?: number }) => {
      if (!aiToolsService) throw new Error('AI Tools Service not available');
      
      const result = await aiToolsService.executeTool({
        name: 'search_meeting_knowledge',
        parameters
      });
      
      return result.data; // Return the actual data, not wrapped
    },
    // ... other tools
  }
});
```

### **🎯 Key Implementation Requirements**

#### **1. Tool Schema Definition**
- **Location**: ElevenLabs UI (agent configuration) - NOT in code
- **Code Requirement**: Function names and parameters must match UI configuration exactly
- **Our Status**: We have tool definitions in `aiToolsService.ts` - need to configure in ElevenLabs UI

#### **2. Function Implementation**
- **Async Support**: ✅ Full async support with API calls
- **Parameters**: Passed as single object matching UI schema
- **Return Value**: Return data directly (no wrapper object needed)
- **Error Handling**: Throw errors for proper agent feedback

#### **3. Agent Integration**
- **Tool Discovery**: Agent learns about tools from ElevenLabs UI configuration
- **Execution**: Agent calls clientTools functions by name
- **Response Handling**: Returned data is sent back to agent for reasoning

---

## 🛠 **Implementation Steps**

### **Step 1: ElevenLabs UI Configuration** 
**Priority**: CRITICAL - Must be done first
**Time**: 30-60 minutes

#### **Actions Required:**
1. **Access ElevenLabs Dashboard**: Log into ElevenLabs UI with our agent ID
2. **Configure 5 Client Tools** in agent settings:

```json
// Tool 1: search_meeting_knowledge
{
  "name": "search_meeting_knowledge",
  "description": "Search through meeting knowledge and context using semantic search",
  "parameters": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string", 
        "description": "The search query or question about meeting content"
      },
      "content_type": {
        "type": "string",
        "enum": ["fact", "context", "summary", "question", "answer"],
        "description": "Filter by specific content type (optional)"
      },
      "limit": {
        "type": "number",
        "description": "Maximum number of results to return (default: 5)",
        "default": 5
      }
    },
    "required": ["query"]
  }
}

// Tool 2: recall_decisions  
{
  "name": "recall_decisions",
  "description": "Recall specific decisions made in meetings",
  "parameters": {
    "type": "object",
    "properties": {
      "topic": {
        "type": "string",
        "description": "The topic or subject of the decision to recall"
      }
    },
    "required": ["topic"]
  }
}

// Tool 3: get_action_items
{
  "name": "get_action_items", 
  "description": "Retrieve action items and tasks from meeting discussions",
  "parameters": {
    "type": "object",
    "properties": {
      "assignee": {
        "type": "string",
        "description": "Filter by person assigned (optional)"
      },
      "status": {
        "type": "string",
        "enum": ["pending", "completed", "all"],
        "description": "Filter by completion status (default: all)",
        "default": "all"
      }
    },
    "required": []
  }
}

// Tool 4: summarize_topic
{
  "name": "summarize_topic",
  "description": "Generate a summary of discussions on a specific topic", 
  "parameters": {
    "type": "object",
    "properties": {
      "topic": {
        "type": "string",
        "description": "The topic to summarize"
      }
    },
    "required": ["topic"]
  }
}

// Tool 5: find_similar_discussions
{
  "name": "find_similar_discussions",
  "description": "Find similar discussions or topics from meeting history",
  "parameters": {
    "type": "object", 
    "properties": {
      "reference_text": {
        "type": "string",
        "description": "Text or topic to find similar discussions for"
      },
      "scope": {
        "type": "string",
        "enum": ["current_meeting", "all_meetings"],
        "description": "Search scope (default: current_meeting)",
        "default": "current_meeting"
      }
    },
    "required": ["reference_text"]
  }
}
```

#### **Configuration Notes:**
- Set tools as "blocking" if agent should wait for response
- Ensure tool names match our code implementation exactly
- Test each tool individually in ElevenLabs UI

### **Step 2: Update useElevenLabsVoiceRAG Implementation**
**Priority**: HIGH - Core functionality fix
**Time**: 2-3 hours

#### **File**: `src/hooks/useElevenLabsVoiceRAG.ts`

```typescript
// CURRENT BROKEN CODE (lines ~44-213):
const conversation = useConversation({
  // Missing clientTools configuration!
});

await conversation.startSession({
  agentId: agentId!,
  // tools: aiToolsService?.getAvailableTools(), // COMMENTED OUT!
});

// CORRECTED IMPLEMENTATION:
const clientTools = useMemo(() => {
  if (!aiToolsService) return {};
  
  return {
    search_meeting_knowledge: async (parameters: { query: string; content_type?: string; limit?: number }) => {
      try {
        const result = await aiToolsService.executeTool({
          name: 'search_meeting_knowledge',
          parameters
        });
        
        if (!result.success) {
          throw new Error(result.error || 'Search failed');
        }
        
        return result.data;
      } catch (error) {
        console.error('🔧 Tool execution failed - search_meeting_knowledge:', error);
        throw error;
      }
    },
    
    recall_decisions: async (parameters: { topic: string }) => {
      try {
        const result = await aiToolsService.executeTool({
          name: 'recall_decisions', 
          parameters
        });
        
        if (!result.success) {
          throw new Error(result.error || 'Decision recall failed');
        }
        
        return result.data;
      } catch (error) {
        console.error('🔧 Tool execution failed - recall_decisions:', error);
        throw error;
      }
    },
    
    get_action_items: async (parameters: { assignee?: string; status?: string }) => {
      try {
        const result = await aiToolsService.executeTool({
          name: 'get_action_items',
          parameters
        });
        
        if (!result.success) {
          throw new Error(result.error || 'Action items retrieval failed');
        }
        
        return result.data;
      } catch (error) {
        console.error('🔧 Tool execution failed - get_action_items:', error);
        throw error;
      }
    },
    
    summarize_topic: async (parameters: { topic: string }) => {
      try {
        const result = await aiToolsService.executeTool({
          name: 'summarize_topic',
          parameters
        });
        
        if (!result.success) {
          throw new Error(result.error || 'Topic summarization failed');
        }
        
        return result.data;
      } catch (error) {
        console.error('🔧 Tool execution failed - summarize_topic:', error);
        throw error;
      }
    },
    
    find_similar_discussions: async (parameters: { reference_text: string; scope?: string }) => {
      try {
        const result = await aiToolsService.executeTool({
          name: 'find_similar_discussions',
          parameters
        });
        
        if (!result.success) {
          throw new Error(result.error || 'Similar discussions search failed');
        }
        
        return result.data;
      } catch (error) {
        console.error('🔧 Tool execution failed - find_similar_discussions:', error);
        throw error;
      }
    }
  };
}, [aiToolsService]);

const conversation = useConversation({
  clientTools,
  onMessage: onMessageCallback,
  onError: onErrorCallback,
  onConnect: () => setIsConnected(true),
  onDisconnect: () => setIsConnected(false)
});

// Simple session start - no tools config needed here!
await conversation.startSession({
  agentId: agentId!
});
```

### **Step 3: Add Tool Execution Tracking**
**Priority**: MEDIUM - For debugging and UX
**Time**: 1 hour

#### **Enhanced Tool Logging & State Management:**

```typescript
const [lastToolExecution, setLastToolExecution] = useState<{
  toolName: string;
  parameters: unknown;
  result: unknown;
  timestamp: string;
  duration: number;
} | null>(null);

// Wrap each tool with execution tracking
const createTrackedTool = (toolName: string, toolFunction: (params: unknown) => Promise<unknown>) => {
  return async (parameters: unknown) => {
    const startTime = Date.now();
    
    console.log(`🔧 Executing tool: ${toolName}`, { parameters, timestamp: new Date().toISOString() });
    
    try {
      const result = await toolFunction(parameters);
      const duration = Date.now() - startTime;
      
      const execution = {
        toolName,
        parameters,
        result,
        timestamp: new Date().toISOString(),
        duration
      };
      
      setLastToolExecution(execution);
      setLastToolCall({ name: toolName, parameters });
      
      if (onToolCall) {
        onToolCall({ name: toolName, parameters }, { success: true, data: result });
      }
      
      console.log(`🔧 Tool completed: ${toolName} (${duration}ms)`, { result });
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      console.error(`🔧 Tool failed: ${toolName} (${duration}ms)`, { error, parameters });
      
      if (onToolCall) {
        onToolCall({ name: toolName, parameters }, { 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
      
      throw error;
    }
  };
};
```

### **Step 4: Testing & Validation**
**Priority**: HIGH - Must verify everything works
**Time**: 2-3 hours

#### **Test Scenarios:**

1. **Basic Tool Execution**
   ```
   User: "What did we decide about the budget?"
   Expected: AI calls recall_decisions with topic="budget"
   Verify: Tool executes, returns data, AI responds with formatted info
   ```

2. **Multi-Tool Conversation**
   ```
   User: "Show me action items for John and find similar discussions"  
   Expected: AI calls get_action_items + find_similar_discussions
   Verify: Both tools execute, AI synthesizes responses
   ```

3. **Error Handling**
   ```
   Scenario: Invalid parameters or search failures
   Expected: Graceful error handling, AI explains the issue
   Verify: No crashes, meaningful error messages
   ```

4. **Performance Testing**
   ```
   Verify: Tool execution < 3 seconds
   Verify: Real-time conversation flow maintained
   Verify: No blocking or freezing during tool calls
   ```

---

## 📋 **Implementation Checklist**

### **Pre-Implementation (Before coding)**
- [ ] **Access ElevenLabs Dashboard** with agent ID: `${process.env.VITE_ELEVENLABS_AGENT_ID}`
- [ ] **Configure 5 client tools** in ElevenLabs UI (exact schema match required)
- [ ] **Set tool behavior** (blocking vs non-blocking) 
- [ ] **Test tool configuration** in ElevenLabs UI
- [ ] **Verify agent can discover tools** in ElevenLabs UI

### **Implementation**
- [ ] **Update useElevenLabsVoiceRAG.ts** with clientTools configuration
- [ ] **Remove commented tool code** (lines 200-202)
- [ ] **Add proper error handling** for each tool
- [ ] **Implement execution tracking** for debugging
- [ ] **Add TypeScript types** for all tool parameters

### **Testing & Validation** 
- [ ] **Test each tool individually** (5 separate tests)
- [ ] **Test multi-tool conversations** (2-3 scenarios)
- [ ] **Test error scenarios** (invalid params, failures)
- [ ] **Performance testing** (response times < 3s)
- [ ] **End-to-end user journey** (voice → AI → tool → response)

### **Documentation**
- [ ] **Update README** with tool integration details
- [ ] **Document ElevenLabs UI configuration** for future reference
- [ ] **Create troubleshooting guide** for common tool issues
- [ ] **Update implementation plan** with completion status

---

## ⚠️ **Critical Dependencies**

### **Prerequisite: ElevenLabs UI Access**
- **Requirement**: Access to ElevenLabs dashboard with our agent ID
- **Risk**: Cannot proceed without UI tool configuration
- **Mitigation**: Verify agent ID and dashboard access before starting

### **Environment Variables**
- **Required**: `VITE_ELEVENLABS_AGENT_ID` must be valid and accessible
- **Verification**: Test agent ID in ElevenLabs UI before implementation

### **AI Tools Service**  
- **Dependency**: `aiToolsService.executeTool()` must be working
- **Verification**: Test individual tool execution before ElevenLabs integration

---

## 🎯 **Success Criteria**

### **Minimum Viable Integration**
1. **All 5 tools configured** in ElevenLabs UI
2. **Client tools working** in useConversation hook
3. **At least 1 tool working** end-to-end (voice → AI → tool → response)
4. **No breaking errors** during tool execution

### **Optimal Integration**
1. **All 5 tools working** end-to-end
2. **Multi-tool conversations** working smoothly
3. **Performance < 3 seconds** per tool execution
4. **Proper error handling** and user feedback
5. **Visual feedback** in UI during tool execution

---

## 📅 **Timeline Estimate**

- **ElevenLabs UI Configuration**: 1 hour
- **Code Implementation**: 3-4 hours  
- **Testing & Debugging**: 2-3 hours
- **Documentation**: 1 hour
- **Total**: 7-9 hours (1-2 days)

---

**Status**: Ready for Implementation  
**Next Step**: Access ElevenLabs UI and configure client tools  
**Blocking**: None - all research complete  
**Risk Level**: Low (clear implementation path)

---

*Created: June 28, 2025*  
*Research Sources: @elevenlabs/react docs + Perplexity validation*