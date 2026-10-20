// Configuración de Conexión a Supabase (IEmpresa)
const SUPABASE_URL = 'https://jbpictwlvvfmvglmeyzd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpicGljdHdsdnZmbXZnbG1leXpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1MTU5NjgsImV4cCI6MjEwODA5MTk2OH0._bga-YB5dHo1jSW8OqwsCyaFaVu6oJHOLFnhRbugvU8';

// Webhook oficial de Google Apps Script (Envío de correos OTP e invitaciones)
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzgPfq9RfH1FKFrOhMvX4R0Fc32pHVNBOv1OEAsa0XnLbZtWduSwmjEOwyFd3ac_WaZOg/exec';

// Instancia global de Supabase
const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

