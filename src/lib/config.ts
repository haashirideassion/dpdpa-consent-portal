/**
 * APPLICATION CONFIGURATION
 * Centralized handling for environment variables with validation.
 */

// Helper to get env variables with fallback support for different environments (Vite vs Node)
const getEnv = (key: string): string => {
  const value = import.meta.env[key] || process.env[key] || '';
  return value.trim();
};

export const config = {
  supabase: {
    url: getEnv('VITE_SUPABASE_URL'),
    anonKey: getEnv('VITE_SUPABASE_ANON_KEY') || getEnv('VITE_SUPABASE_PUBLISHABLE_KEY'),
  },
  azure: {
    clientId: getEnv('VITE_AZURE_CLIENT_ID'),
    tenantId: getEnv('VITE_AZURE_TENANT_ID'),
  },
  app: {
    baseUrl: getEnv('VITE_BASE_URL') || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8080'),
  }
};

/**
 * Validates that all critical environment variables are present.
 * This runs at startup to prevent cryptic errors later.
 */
export const validateConfig = () => {
  const required = [
    { name: 'VITE_SUPABASE_URL', value: config.supabase.url },
    { name: 'VITE_SUPABASE_ANON_KEY', value: config.supabase.anonKey },
  ];

  const missing = required.filter(item => !item.value);

  if (missing.length > 0) {
    const errorMsg = `Missing required environment variables: ${missing.map(m => m.name).join(', ')}. Please check your .env file.`;
    console.error('Configuration Error:', errorMsg);
    
    // In development, we want to see this immediately
    if (import.meta.env.DEV) {
      throw new Error(errorMsg);
    }
  }
};
