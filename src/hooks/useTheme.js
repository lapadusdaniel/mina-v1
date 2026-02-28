import { useEffect, useState } from 'react'
import { doc, getDoc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'

const VALID_THEMES = ['luxos', 'minimal', 'indraznet', 'cald']
const DEFAULT_THEME = 'luxos'

export function useTheme(uid) {
  const [theme, setThemeState] = useState(DEFAULT_THEME)
  const [loading, setLoading] = useState(true)

  const applyTheme = (t) => {
    const valid = VALID_THEMES.includes(t) ? t : DEFAULT_THEME
    document.documentElement.setAttribute('data-theme', valid)
    setThemeState(valid)
  }

  useEffect(() => {
    if (!uid) {
      applyTheme(DEFAULT_THEME)
      setLoading(false)
      return
    }
    getDoc(doc(db, 'profiles', uid))
      .then(snap => {
        const saved = snap.data()?.theme
        applyTheme(saved || DEFAULT_THEME)
      })
      .catch(() => applyTheme(DEFAULT_THEME))
      .finally(() => setLoading(false))
  }, [uid])

  const setTheme = async (newTheme) => {
    applyTheme(newTheme)
    if (!uid) return
    try {
      await updateDoc(doc(db, 'profiles', uid), { theme: newTheme })
    } catch (err) {
      console.error('useTheme: failed to save', err)
    }
  }

  return { theme, setTheme, loading }
}
