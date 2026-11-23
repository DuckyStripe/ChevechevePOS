import axios from 'axios';
import Cookies from 'js-cookie';

export const fetchProducts = async () => {
  const token = Cookies.get('authToken'); // Asegúrate de que esto se llame "authToken" como en tu uso de cookies

  const config = {
    method: 'get',
    url: 'https://cheveposapi.codelabs.com.mx/Endpoints/Gets/getproducts.php',
    headers: {
      'Authorization': `Bearer ${token}` // Añade el token como Bearer token en los headers
    }
  };

  try {
    const response = await axios.request(config);

    if (response.data.success) {
      return response.data.products;
    } else {
      return { success: false, message: response.data.message };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export const fetchRecentPurchaseProducts = async () => {
  const token = Cookies.get('authToken'); // Asegúrate de que esto se llame "authToken" como en tu uso de cookies

  const config = {
    method: 'get',
    url: 'https://cheveposapi.codelabs.com.mx/Endpoints/Gets/getlastProducts.php',
    headers: {
      'Authorization': `Bearer ${token}` // Añade el token como Bearer token en los headers
    }
  };

  try {
    const response = await axios.request(config);

    if (response.data.success) {
      return response.data.products;
    } else {
      return { success: false, message: response.data.message };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export const fetchDashboardData = async () => {
  const token = Cookies.get('authToken'); // Asegúrate de que esto se llame "authToken" como en tu uso de cookies

  const config = {
    method: 'get',
    url: 'https://cheveposapi.codelabs.com.mx/Endpoints/Gets/getDataDash.php',
    headers: {
      'Authorization': `Bearer ${token}` // Añade el token como Bearer token en los headers
    }
  };

  try {
    const response = await axios.request(config);

    if (response.data.success) {
      return response.data.Data;
    } else {
      return { success: false, message: response.data.message };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
};
export const fetchDataProfit = async () => {
  const token = Cookies.get('authToken'); // Asegúrate de que esto se llame "authToken" como en tu uso de cookies

  const config = {
    method: 'get',
    url: 'https://cheveposapi.codelabs.com.mx/Endpoints/Gets/GetDataProfits.php',
    headers: {
      'Authorization': `Bearer ${token}` // Añade el token como Bearer token en los headers
    }
  };

  try {
    const response = await axios.request(config);

    if (response.data.success) {
      return response.data.Data;
    } else {
      return { success: false, message: response.data.message };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
};