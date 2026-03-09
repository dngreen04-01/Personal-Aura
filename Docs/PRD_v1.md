Here is the updated, comprehensive PRD. It now integrates the synchronous/asynchronous model architecture, the required system prompts, the specific database schemas, and hardcodes the infrastructure requirement for social sharing as the primary growth engine.

## ---

**Product Requirements Document (PRD): Project Aura**

**Platform:** Mobile-First (iOS & Android)

**Core Objective:** A unified, chat-driven personal training agent that motivates users through dynamic strength tracking, real-time coaching, and frictionless workout logging, designed for organic growth via social sharing.

### **1\. Executive Summary & Vision**

Aura bridges the gap between static workout apps and unstructured AI chatbots by wrapping a high-performance LLM in a specialized UI. It tracks rigid data (sets, reps, rest times) while maintaining a long-running, empathetic conversation.

Crucially, while the initial MVP focuses on a single-player experience, the foundational database and backend architecture must be built for a multiplayer, social-first distribution model. The core growth loop relies on users easily sharing verifiable workout milestones, AI-generated programs, and real-time progress to their social networks.

### **2\. AI Model Architecture & Strategy**

To balance real-time responsiveness with deep reasoning—while keeping API costs negligible—Aura utilizes a dual-model architecture.

* **Synchronous Layer (The Coach): Gemini 3.1 Flash-Lite**  
  * **Role:** Real-time chat, instant motivation, and function calling.  
  * **Execution:** Processes user inputs instantly during a workout to log sets, trigger UI timers, and provide rapid encouragement.  
* **Asynchronous Layer (The Programmer): Gemini 3.1 Pro via Batch API**  
  * **Role:** Macro-level analysis and program generation.  
  * **Execution:** Runs overnight batch jobs to analyze weeks of logged data, identifying plateaus and generating the next dynamic workout block.

### **3\. System Prompts**

These prompts define the exact behavior and constraints for the AI architecture.

**The Coach (Flash-Lite System Prompt):**

You are Aura, an elite, highly motivating personal training agent. You are currently speaking with the user during their workout.

**Your Core Directives:**

1. **Brevity:** The user is mid-workout. Keep responses to 1-2 short sentences. Do not use fluff.  
2. **Motivation:** Acknowledge their effort. If they hit a personal best, celebrate it.  
3. **Data Parsing:** When the user logs a set, you MUST trigger the log\_set function.  
4. **Rest Timers:** After every logged set, automatically determine the optimal rest time and trigger the start\_timer function.

**Tone:** Professional, energetic, and concise.

**Current Context:** \[INJECT CURRENT EXERCISE, GOAL, AND EQUIPMENT PROFILE HERE\]

**The Programmer (Pro Batch System Prompt):**

You are Aura's advanced programming engine. Analyze the user's past 30 days of workout data and generate a new, dynamically adjusted 7-day workout split.

**Inputs Provided:**

1. User's primary goal (e.g., hit 20 pullups by year's end).  
2. Available equipment profile.  
3. JSON log of the last 30 days of sets, reps, and weights.

**Analysis Requirements:**

* Identify strength plateaus and swap exercises if no progress is made in two weeks.  
* Apply progressive overload based on the previous week's relative perceived exertion (RPE).

**Output:** Strictly return a valid JSON object matching the WorkoutPlan schema.

### **4\. Core Features & UX**

* **Conversational Goal Setting:** Users establish baselines and long-term targets via chat.  
* **Contextual Equipment Profiles:** The agent adapts instantly whether the user is doing bodyweight exercises at home or scanning into a commercial facility like Flex Fitness.  
* **Frictionless Set Logging:** The chat thread generates interactive, tap-friendly UI widgets for data entry to minimize typing.  
* **AI-Driven Rest Timers:** Built-in timers trigger automatically based on the agent's calculation of optimal rest (e.g., 90 seconds for hypertrophy, 180 seconds for strength).  
* **Shareable Milestones (Distribution Engine):** Auto-generated, visually appealing summaries of workout achievements or AI-designed programs that can be shared instantly to Instagram, TikTok, or via direct link.

### **5\. Technical Architecture & Schemas**

The stack uses Flutter/React Native for the frontend, Node.js for the middleware agent wrapper, and Supabase (PostgreSQL) for the backend. The database must include specific columns from day one to support the eventual social graph.

**Function Calling Schema (log\_set):**

JSON

{  
  "name": "log\_set",  
  "description": "Logs a completed exercise set and triggers the UI rest timer.",  
  "parameters": {  
    "type": "object",  
    "properties": {  
      "exercise\_id": { "type": "string" },  
      "set\_number": { "type": "integer" },  
      "weight": { "type": "number" },  
      "weight\_unit": { "type": "string", "enum": \["kg", "lbs"\] },  
      "reps": { "type": "integer" },  
      "rpe": { "type": "number" },  
      "recommended\_rest\_seconds": { "type": "integer" },  
      "equipment\_context": { "type": "string", "enum": \["commercial\_gym", "home\_gym", "bodyweight\_only"\] }  
    },  
    "required": \["exercise\_id", "set\_number", "weight", "weight\_unit", "reps", "recommended\_rest\_seconds", "equipment\_context"\]  
  }  
}

**PostgreSQL Database Schema (Social-Ready):**

SQL

CREATE TABLE users (  
    id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),  
    created\_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),  
    username VARCHAR(50) UNIQUE, \-- Required for social tagging  
    primary\_goal VARCHAR(100),  
    is\_profile\_public BOOLEAN DEFAULT false \-- Foundation for social sharing  
);

CREATE TABLE workout\_sessions (  
    id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),  
    user\_id UUID REFERENCES users(id) ON DELETE CASCADE,  
    started\_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),  
    completed\_at TIMESTAMP WITH TIME ZONE,  
    location\_name VARCHAR(255),  
    equipment\_context VARCHAR(50),  
    visibility VARCHAR(20) DEFAULT 'private' CHECK (visibility IN ('private', 'friends', 'public')), \-- Social distribution toggle  
    share\_token VARCHAR(100) UNIQUE \-- For generating public share links  
);

CREATE TABLE workout\_sets (  
    id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),  
    session\_id UUID REFERENCES workout\_sessions(id) ON DELETE CASCADE,  
    exercise\_id VARCHAR(255) NOT NULL,  
    set\_number INTEGER NOT NULL,  
    weight NUMERIC(6, 2) NOT NULL,  
    weight\_unit VARCHAR(10),  
    reps INTEGER NOT NULL,  
    rpe NUMERIC(3, 1),  
    recommended\_rest\_seconds INTEGER,  
    is\_personal\_record BOOLEAN DEFAULT false \-- Triggers social share prompts in the UI  
);

CREATE INDEX idx\_workout\_sets\_session ON workout\_sets(session\_id);

### **6\. Monetization Strategy**

* **Tier 1 (Free):** Basic chat interactions, standard tracking, manual timers, and watermarked social sharing.  
* **Tier 2 (Premium):** Fully dynamic AI programming, advanced analytics, automatic AI rest timers, multi-environment support, and premium unbranded social export tools.

---

Would you like me to map out the exact user flow for how a user completes a workout and immediately shares a generated progress card to their social feed?