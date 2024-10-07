// utils/auth.js
import Cookies from "js-cookie";
import axios from "axios";
export const isAuthenticated = async () => {
  const token = Cookies.get("authToken");
  if (!token) return false;

  // Opción simple para verificar si existe el token.
  // Para una implementación robusta, podrías hacer una petición al servidor para validarlo
  try {
    // Verificación del token con el servidor
    const formData = new FormData();
    formData.append("token", token);

    const response = await axios.post(
      "https://cheveposapi.codelabs.com.mx//Endpoints/auth/validatelogin.php",
      formData
    );

    const result = response.data;
    if (result.success) {
      return true;
    } else {
      return false;
    }
  } catch (error) {
    return false;
  }
};
