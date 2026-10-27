import { createClient } from 'npm:@supabase/supabase-js@2'
import { createHandler } from './handler.js'
import { disabledProvider } from './provider.js'
import { mockProvider } from './mock-provider.js'
import { jennabotProvider } from './jennabot-provider.js'

// Deploy ONLY to the separate greenroomid-gambarin Supabase project.
// Keep platform JWT verification enabled; handler also checks a dedicated backend JWT.
Deno.serve(createHandler({
  createClient,
  env: (name) => Deno.env.get(name),
  background: (task) => EdgeRuntime.waitUntil(task),
  diagnostic: (event) => console.info(JSON.stringify({ component: 'gambarin-worker', ...event })),
  // Mock is an explicit backend opt-in; absent/mistyped flags stay disabled.
  provider: Deno.env.get('GAMBARIN_WORKER_PROVIDER_MODE') === 'mock'
    && Deno.env.get('GAMBARIN_MOCK_TEST_ENABLED') === 'true'
    ? mockProvider()
    : Deno.env.get('GAMBARIN_WORKER_PROVIDER_MODE') === 'jennabot'
      && Deno.env.get('GAMBARIN_JENNABOT_COMMERCIAL_APPROVED') === 'true'
      ? jennabotProvider({
        apiKey: Deno.env.get('GAMBARIN_JENNABOT_API_KEY'),
        projectId: Deno.env.get('GAMBARIN_JENNABOT_PROJECT_ID'),
      }) : disabledProvider(),
}))
