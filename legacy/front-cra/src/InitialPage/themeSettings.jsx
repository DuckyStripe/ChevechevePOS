import React, { useEffect, useState } from "react";
import { FaMoon, FaSun } from "react-icons/fa";

const ThemeSettings = () => {
  const [isDarkMode, setIsDarkMode] = useState(
    localStorage.getItem("colorschema") === "dark_mode"
  );

  const toggleTheme = () => {
    const newTheme = isDarkMode ? "light_mode" : "dark_mode";
    localStorage.setItem("colorschema", newTheme);
    setIsDarkMode(!isDarkMode);
    document.documentElement.setAttribute("data-layout-mode", newTheme);
  };

  useEffect(() => {
    document.documentElement.setAttribute(
      "data-layout-mode",
      isDarkMode ? "dark_mode" : "light_mode"
    );
  }, [isDarkMode]);

  return (
    <div className="customizer-links" id="setdata">
      <ul className="sticky-sidebar">
        <li className="sidebar-icons" onClick={toggleTheme}>
          {isDarkMode ? (
            <FaSun size={30} color="#FFC107" title="Cambiar a Modo Claro" />
          ) : (
            <FaMoon
              size={30}
              color="#ffffff"
              style={{ transition: "color 0.3s" }}
              className="moon-icon"
              title="Cambiar a Modo Oscuro"
            />
          )}
        </li>
      </ul>
    </div>
  );
};

export default ThemeSettings;
