import { createClient } from 'npm:@supabase/supabase-js@2'
import { createHandler } from './handler.js'

// Deploy to greenroomid-gambarin with verify_jwt=false: no session exists yet.
// The handler applies persistent rate limits and verifies passwords with Auth.
Deno.serve(createHandler({ createClient, env: (name) => Deno.env.get(name) }))
