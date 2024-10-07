// products.js
import axios from 'axios';
import Cookies from 'js-cookie';

export const fetchCategory = async () => {
  const token = Cookies.get('authToken');

  const config = {
    method: 'get',
    url: 'https://cheveposapi.codelabs.com.mx/Endpoints/Gets/getCategoriesTable.php',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  };

  try {
    const response = await axios.request(config);

    if (response.data.success) {
      const data = response.data.Data;
      return  data ;
    } else {
      return { success: false, message: response.data.message };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export const fetchCategories = async () => {
  const token = Cookies.get('authToken');

  const config = {
    method: 'get',
    url: 'https://cheveposapi.codelabs.com.mx/Endpoints/Gets/getCategories.php',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  };

  try {
    const response = await axios.request(config);

    if (response.data.success) {
      const data = response.data.Data;
      return  data ;
    } else {
      return { success: false, message: response.data.message };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
};
export const fetchSubCategories = async () => {
  const token = Cookies.get('authToken');

  const config = {
    method: 'get',
    url: 'https://cheveposapi.codelabs.com.mx/Endpoints/Gets/getSubcategories.php',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  };

  try {
    const response = await axios.request(config);

    if (response.data.success) {
      const data = response.data.Data;
      return  data ;
    } else {
      return { success: false, message: response.data.message };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
};
export const fetchUnidad = async () => {
  const token = Cookies.get('authToken');

  const config = {
    method: 'get',
    url: 'https://cheveposapi.codelabs.com.mx/Endpoints/Gets/getUnits.php',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  };

  try {
    const response = await axios.request(config);

    if (response.data.success) {
      const data = response.data.Data;
      return  data ;
    } else {
      return { success: false, message: response.data.message };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
};