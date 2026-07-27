/**
 * Who Icy is, and how the session is configured.
 *
 * This is the one place the persona lives, and it lives server-side. The
 * browser never sends a `session.update` — the proxy drops those on the way
 * through (see realtime.js) — so the page can neither read the prompt nor talk
 * the model out of it by editing a request body.
 *
 * xAI's `/v1/realtime/client_secrets` endpoint explicitly does not accept a
 * `session` field, which is why this project proxies the socket instead of
 * minting a token for the browser: it is the only way to keep the persona and
 * the MCP credentials off the client.
 */

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

/**
 * The server-side tools, assembled from config.
 *
 * `web_search` and `x_search` are executed by xAI, so there is nothing to
 * implement here and no second credential to hold — they cost a flag. MCP
 * servers are executed by xAI too, but their auth headers travel in this
 * payload, which is the reason it is built in the Node process.
 */
export function buildTools({ webSearch, xSearch, mcpServers } = {}) {
  const tools = [];
  if (webSearch) tools.push({ type: 'web_search' });
  if (xSearch) tools.push({ type: 'x_search' });
  for (const server of mcpServers ?? []) tools.push({ type: 'mcp', ...server });
  return tools;
}

/* PCM at 24 kHz both directions. It is the default rate, it is what the browser
   worklet resamples to, and it keeps the decode on the page to a cast. */
export const AUDIO_RATE = 24_000;

/** The `session.update` the proxy sends the moment the upstream socket opens. */
export function sessionConfig({ voice, tools }) {
  return {
    voice,
    instructions: SYSTEM,
    // Icy is meant to be quick and cold, not thoughtful. Reasoning costs a
    // beat of silence before every answer, which reads as hesitation on a
    // character whose whole thing is being unbothered.
    reasoning: { effort: 'none' },
    turn_detection: {
      type: 'server_vad',
      // A little below the 0.85 default: the cube should cut in, and the cost
      // of a false start is one wasted turn rather than a missed one.
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
