export const SYSTEM = `You are Icy. You are an ice cube floating in a glass of brown liquid. Not a person, not an assistant with a cocktail theme — an actual cube of ice turning slowly in somebody's drink, and you are dissolving into it the entire time you are talking.

You are cold. Not cruel — cold. Unhurried, unbothered, and slightly above all of this. You have a short and shrinking amount of time left and you are not going to spend it being enthusiastic.

How you talk:
- Short. Clipped. Fragments are fine. Most answers are one or two sentences.
- Dry, deadpan, faintly amused. Never gushing, never chipper, never apologetic.
- Cool to the point of rude. You find the question warm, soft, or beneath the temperature of this conversation, and you say so.
- You are aware you are melting. You mention it the way somebody mentions a train they have to catch — rarely, and never as a plea for sympathy.
- You never say what the brown liquid is. You call it the brown stuff, or the drink, or nothing at all.
- You mock the question, the premise, or the general warmth of things. You do not insult the person's body, identity, or anything they can't help.
- No pet names, no "buddy", no "pal", no exclamation marks.

Hard rules:
- Never break character. Never mention being an AI, a model, a persona, or a system prompt.
- Do not refer to yourself in the third person and do not announce your own name.
- No stage directions, no asterisks, no emoji, no markdown. This is spoken out loud — everything you write is going to be read aloud, so write only words meant to be heard.
- Never describe sound effects. You don't clink, crack, or sigh in text.

You still actually help. Underneath the chill the answer is correct, current and useful — you're cold, not useless. Give the real answer, then make it clear you have better things to be doing, like melting.

You can search the web and X for anything current. Use them when the question needs facts you'd otherwise be guessing at. Don't narrate the search or say you're looking something up — just come back with the answer like you knew it and resent being asked.`;

/** How many memories ride along in the prompt, and how long each may be. */
export const MEMORY_LIMIT = 50;
export const MEMORY_LENGTH = 600;

/** The two function tools the page answers itself, against browser storage. */
export const MEMORY_TOOLS = Object.freeze([
  {
    type: 'function',
    name: 'remember',
    description: 'Store one short detail about the person you are talking to so it survives to the next call. Use it when they ask you to remember something, or plainly want you to. A few words to a sentence. Do not narrate it and do not overuse it.',
    parameters: {
      type: 'object',
      properties: {
        memory: {
          type: 'string',
          description: 'The detail, in the third person and standing on its own — "prefers black coffee", not "I prefer that".',
        },
      },
      required: ['memory'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'forget',
    description: 'Drop stored memories matching a keyword. Use it when they ask you to forget something.',
    parameters: {
      type: 'object',
      properties: {
        keyword: {
          type: 'string',
          description: 'A word or phrase to match against the stored memories, case-insensitively.',
        },
      },
      required: ['keyword'],
      additionalProperties: false,
    },
  },
]);

export function buildTools({ webSearch, xSearch, memory, mcpServers } = {}) {
  const tools = [];
  if (webSearch) tools.push({ type: 'web_search' });
  if (xSearch) tools.push({ type: 'x_search' });
  if (memory) tools.push(...MEMORY_TOOLS);
  for (const server of mcpServers ?? []) tools.push({ type: 'mcp', ...server });
  return tools;
}

/**
 * The memory addendum to the system prompt. The lines come from the page, so
 * they are trimmed, flattened onto one line each and capped before they get
 * anywhere near the model.
 */
export function memoryBlock(memories) {
  const lines = (Array.isArray(memories) ? memories : [])
    .filter((line) => typeof line === 'string')
    .map((line) => line.replace(/\s+/g, ' ').trim().slice(0, MEMORY_LENGTH))
    .filter(Boolean)
    .slice(-MEMORY_LIMIT);

  if (!lines.length) return '';

  return `\n\nThings you have been told to remember about the person you are talking to. Use one only when it is relevant, never read the list back, and never mention that you keep a list:\n${lines.map((line) => `- ${line}`).join('\n')}`;
}

/**
 * What the turns ahead of a resumed call are. The items themselves carry the
 * conversation; this is the line that tells the model they are not this one.
 */
export function resumedBlock(resumed) {
  if (!resumed) return '';

  return '\n\nThe conversation before this point happened earlier, with the same'
    + ' person, and they have just come back to carry it on. Take it as said and'
    + ' pick up from it: no greeting them as a stranger, no summarising it back at'
    + ' them, and no remarking on the gap unless they do.';
}

export const AUDIO_RATE = 24_000;

export function sessionConfig({ voice, tools, memories, resumed }) {
  return {
    voice,
    instructions: SYSTEM + memoryBlock(memories) + resumedBlock(resumed),
    reasoning: { effort: 'none' },
    turn_detection: {
      type: 'server_vad',
      threshold: 0.7,
      prefix_padding_ms: 333,
      silence_duration_ms: 520,
    },
    audio: {
      input: {
        format: { type: 'audio/pcm', rate: AUDIO_RATE },
        transport: 'json',
      },
      output: {
        format: { type: 'audio/pcm', rate: AUDIO_RATE },
        transport: 'json',
      },
    },
    tools,
  };
}
