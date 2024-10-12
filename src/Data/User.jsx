import Cookies from "js-cookie";
import {jwtDecode} from 'jwt-decode';
import axios from "axios";


export const fetchUserData = async () => {
  const token = Cookies.get("authToken");
  const {nombre,nombre_rol} = jwtDecode(token);
  return {nombre,nombre_rol};
};
export const fetchNotifications = async () => {
  const token = Cookies.get('authToken');
  // Configuración de solicitud con método POST
  const config = {
    method: 'post',
    url: 'https://cheveposapi.codelabs.com.mx/Endpoints/Gets/getNotification.php',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  };

  try {
    const response = await axios.request(config);

    if (response.data.success) {
      const data = response.data.Data;
  
      return data;
    } else {
      return { success: false, message: response.data.message };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
};
