import axios from 'axios';
import Cookies from 'js-cookie';



export const fetchUsers = async () => {
  const token = Cookies.get('authToken');
  // Configuración de solicitud con método POST
  const config = {
    method: 'post',
    url: 'https://cheveposapi.codelabs.com.mx/Endpoints/Gets/getUsers.php',
    headers: {
      'Authorization': `Bearer ${token}`,
      // No establezcas 'Content-Type', Axios lo manejará automáticamente
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
export const fetchRolesAvaible= async () => {
  const token = Cookies.get('authToken');
  const formData = new FormData();
  // Configuración de solicitud con método POST
  const config = {
    method: 'get',
    url: 'https://cheveposapi.codelabs.com.mx/Endpoints/Gets/getRolesAvaible.php',
    headers: {
      'Authorization': `Bearer ${token}`,
      // No establezcas 'Content-Type', Axios lo manejará automáticamente
    },
    data: formData // Usa 'data' para enviar el formData
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
