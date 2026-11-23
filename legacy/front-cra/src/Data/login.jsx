import axios from 'axios';
import FormData from 'form-data';
import {encriptarContrasena} from '../Data/DataEncrypt';

export const loginSimulation = async (username, password) => {
  const { contrasena_encriptada } = encriptarContrasena(password);
  const user_encriptado  = encriptarContrasena(username);
  let data = new FormData();
  data.append('usuario', user_encriptado.contrasena_encriptada);
  data.append('contrasena', contrasena_encriptada);

  const config = {
    method: 'post',
    url: 'https://cheveposapi.codelabs.com.mx/Endpoints/auth/login.php',
    data: data,
  };

  try {
    const response = await axios.request(config);

    if (response.data.success) {
      return { success: true, data: response.data };
    } else {
      return { success: false, message: response.data.message };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
};
