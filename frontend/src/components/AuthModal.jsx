import { useState } from 'react'

export default function AuthModal({ onLogin, onClose }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (password === '12345') {
      onLogin()
      onClose()
    } else {
      setError('Palavra-passe incorreta.')
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md mx-4">
        <h2 className="text-xl font-bold text-white mb-4">Login</h2>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
            placeholder="Palavra-passe"
            autoFocus
          />
          {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
          
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg flex items-center justify-center space-x-2"
              title="Cancelar"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span className="hidden sm:inline">Cancelar</span>
            </button>
            <button
              type="submit"
              className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg flex items-center justify-center space-x-2"
              title="Entrar"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
              </svg>
              <span className="hidden sm:inline">Entrar</span>
            </button>
          </div>

          
        </form>
      </div>
    </div>
  )
}