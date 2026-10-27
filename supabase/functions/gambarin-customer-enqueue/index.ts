import { createClient } from 'npm:@supabase/supabase-js@2'
import { createHandler } from './handler.js'

// Deploy to greenroomid-gambarin with platform JWT verification enabled.
// The handler also verifies the bearer with Gambarin Auth before privileged RPC.
Deno.serve(createHandler({ createClient, env: (name) => Deno.env.get(name) }))
