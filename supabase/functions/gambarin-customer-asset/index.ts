import { createClient } from 'npm:@supabase/supabase-js@2'
import { createHandler } from './handler.js'

// Deploy only to the separate Gambarin project with platform JWT verification.
Deno.serve(createHandler({ createClient, env: name => Deno.env.get(name), fetchImpl: fetch }))
