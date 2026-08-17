// Fill these in once you've created the Supabase project (see db/schema.sql
// and the README's "Admin database" section), then flip enabled to true.
//
// The anon key is meant to be public/embedded in client code like this -
// Row Level Security (set up in db/schema.sql) is what keeps it read-only,
// not secrecy of the key itself.
const SUPABASE_CONFIG = {
  enabled: false,
  url: "", // Project Settings -> API -> Project URL, e.g. https://xxxx.supabase.co
  anonKey: "", // Project Settings -> API -> anon public key
};
