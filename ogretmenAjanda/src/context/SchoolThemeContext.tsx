import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { School, getActiveSchool } from '../database/operations/schoolOperations';
import { Colors } from '../theme/colors';

export function getOpaqueTint(hexColor?: string, opacity = 0.04): string {
  if (!hexColor || !hexColor.startsWith('#') || hexColor.length < 7) {
    return Colors.background;
  }
  const r = parseInt(hexColor.slice(1, 3), 16) || 0;
  const g = parseInt(hexColor.slice(3, 5), 16) || 0;
  const b = parseInt(hexColor.slice(5, 7), 16) || 0;
  // Blend with white (255, 255, 255) so the result is a 100% solid, fully opaque pastel
  const blendedR = Math.round(255 * (1 - opacity) + r * opacity);
  const blendedG = Math.round(255 * (1 - opacity) + g * opacity);
  const blendedB = Math.round(255 * (1 - opacity) + b * opacity);
  return `#${blendedR.toString(16).padStart(2, '0')}${blendedG.toString(16).padStart(2, '0')}${blendedB.toString(16).padStart(2, '0')}`;
}

interface SchoolThemeContextType {
  activeSchool: School | null;
  themeColor: string;
  bgTint: string;
  reloadSchoolTheme: () => Promise<void>;
}

const SchoolThemeContext = createContext<SchoolThemeContextType>({
  activeSchool: null,
  themeColor: Colors.primary,
  bgTint: Colors.background,
  reloadSchoolTheme: async () => {},
});

export const SchoolThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeSchool, setActiveSchool] = useState<School | null>(null);

  const reloadSchoolTheme = useCallback(async () => {
    try {
      const active = await getActiveSchool();
      setActiveSchool(active);
    } catch (e) {
      console.warn('Error loading active school theme:', e);
    }
  }, []);

  useEffect(() => {
    reloadSchoolTheme();
  }, [reloadSchoolTheme]);

  const themeColor = activeSchool?.color || Colors.primary;
  const bgTint = activeSchool?.color ? getOpaqueTint(activeSchool.color) : Colors.background;

  return (
    <SchoolThemeContext.Provider
      value={{
        activeSchool,
        themeColor,
        bgTint,
        reloadSchoolTheme,
      }}
    >
      {children}
    </SchoolThemeContext.Provider>
  );
};

export const useSchoolTheme = () => useContext(SchoolThemeContext);
