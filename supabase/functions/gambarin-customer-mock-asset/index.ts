import { createClient } from 'npm:@supabase/supabase-js@2'
import { createHandler } from './handler.js'

// Deploy only to the Gambarin project, with platform JWT verification enabled.
Deno.serve(createHandler({ createClient, env: (name) => Deno.env.get(name) }))
