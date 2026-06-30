import { supabase } from './supabase'

function Login() {
  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/dashboard`
      }
    })
    if (error) alert('Error: ' + error.message)
  }

  return (
    <div className="flex items-center justify-center h-screen bg-gray-100">
      <div className="bg-white p-10 rounded-2xl shadow-lg text-center w-96">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">GreenroomID</h1>
        <p className="text-gray-500 mb-8">Bantuan Tugas Digital</p>
        <button
          onClick={handleGoogleLogin}
          className="flex items-center justify-center gap-3 w-full bg-white border border-gray-300 text-gray-700 font-medium py-3 px-6 rounded-xl hover:bg-gray-50 shadow-sm transition"
        >
          <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
          Masuk dengan Google
        </button>
      </div>
    </div>
  )
}

export default Login