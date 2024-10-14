import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import Select from "react-select";
import AddCategory from "../../core/modals/inventory/addcategory";
import {
  fetchCategories,
  fetchSubCategories,
  fetchUnidad
} from "../../Data/Inventario/category"; // I
// products.js
import axios from "axios";
import Cookies from "js-cookie";
import {  toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

// import ImageWithBasePath from "../../core/img/imagewithbasebath";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Info,
  LifeBuoy,
  PlusCircle,
  X
} from "feather-icons-react/build/IconComponents";
import { useDispatch, useSelector } from "react-redux";
import { setToogleHeader } from "../../core/redux/action";
import { OverlayTrigger, Tooltip } from "react-bootstrap";
import { all_routes } from "../../Router/all_routes";
const AddProduct = () => {
  const navigate = useNavigate();
  const [category, setCategory] = useState([]); // Para almacenar la lista de categorías
  const [subcategory, setSubcategory] = useState([]); // Para almacenar la lista de categorías
  const [unidad, setunidad] = useState([]); // Para almacenar la lista de categorías
  const [previewImage, setPreviewImage] = useState(null);
  const [productData, setProductData] = useState({
    nombre: "",
    unidad: null,
    categoria: null,
    subcategoria: null,
    precioCosto: "",
    precioVenta: "",
    precioMayoreo: "",
    cantidadActual: "",
    cantidadMinima: "",
    imagen: null
  });
  const route = all_routes;
  const dispatch = useDispatch();
  const data = useSelector((state) => state.toggle_header);
  useEffect(() => {
    const loadInitialData = async () => {
      const category = await fetchCategories(); // Cargar por defecto los productos con bajo inventario
      const subcategory = await fetchSubCategories(); // Cargar por defecto los productos con bajo inventario
      const unidad = await fetchUnidad(); // Cargar por defecto los productos con bajo inventario
      setCategory(category);
      setSubcategory(subcategory);
      setunidad(unidad);
    };

    loadInitialData();
  }, []);

  const handleImageChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      setProductData((prevData) => ({
        ...prevData,
        imagen: file
      }));

      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewImage(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };
  const closemodal = () => {
    setProductData({
      nombre: "",
      unidad: null,
      categoria: null,
      subcategoria: null,
      precioCosto: "",
      precioVenta: "",
      precioMayoreo: "",
      cantidadActual: "",
      cantidadMinima: "",
      imagen: null
    });
    setPreviewImage(null);
  }
  // Función para eliminar la imagen cargada
  const handleRemoveImage = () => {
    setPreviewImage(null);
  };
  const handleChange = (key, value) => {
    setProductData((prevData) => ({
      ...prevData,
      [key]: value
    }));
  };

  const validateFormData = () => {
    const errors = {};

    // Validación para nombre: letras y números
    if (!productData.nombre) {
      errors.nombre = "El nombre es requerido.";
    } else if (!/^[a-zA-Z0-9\s]+$/.test(productData.nombre)) {
      errors.nombre = "El nombre solo puede contener letras y números.";
    }

    // Validación para las IDs de unidad, categoría y subcategoría
    if (!productData.unidad?.value) {
      errors.unidad = "La unidad es requerida.";
    }

    if (!productData.categoria?.value) {
      errors.categoria = "La categoría es requerida.";
    }

    if (!productData.subcategoria?.value) {
      errors.subcategoria = "La subcategoría es requerida.";
    }

    // Validación para precios: deben ser números
    if (!productData.precioCosto) {
      errors.precioCosto = "El precio de costo es requerido.";
    } else if (isNaN(productData.precioCosto)) {
      errors.precioCosto = "El precio de costo debe ser un número.";
    }

    if (!productData.precioVenta) {
      errors.precioVenta = "El precio de venta es requerido.";
    } else if (isNaN(productData.precioVenta)) {
      errors.precioVenta = "El precio de venta debe ser un número.";
    }

    // Validación para cantidades: solo números
    if (!productData.cantidadActual) {
      errors.cantidadActual = "La cantidad actual es requerida.";
    } else if (!/^\d+$/.test(productData.cantidadActual)) {
      errors.cantidadActual = "La cantidad actual debe ser un número.";
    }

    if (!productData.cantidadMinima) {
      errors.cantidadMinima = "La cantidad mínima es requerida.";
    } else if (!/^\d+$/.test(productData.cantidadMinima)) {
      errors.cantidadMinima = "La cantidad mínima debe ser un número.";
    }

    return errors;
  };

  const handleFormSubmit = async () => {
    const errors = validateFormData();

    if (Object.keys(errors).length > 0) {
      Object.values(errors).forEach((error) => {
        toast.error(error);
      });
      return;
    }

    const token = Cookies.get("authToken");

    const formData = new FormData();

    formData.append("nombre_producto", productData.nombre);
    formData.append("unidad_id", productData.unidad?.value);
    formData.append("categoria_id", productData.categoria?.value);
    formData.append("subcategoria_id", productData.subcategoria?.value);
    formData.append("precio_compra", productData.precioCosto);
    formData.append("precio_venta", productData.precioVenta);
    formData.append("cantidad", productData.cantidadActual);
    formData.append("cantidad_minima", productData.cantidadMinima);

    // Comprueba si la imagen ha cambiado añadiéndola solo si es diferente
    if (
      productData.imagen &&
      (typeof productData.imagen !== "string" || !productData.imagen.startsWith("http"))
    ) {
      formData.append("imagen_producto", productData.imagen);
    }

    const config = {
      method: "post",
      url: "https://cheveposapi.codelabs.com.mx/Endpoints/Insert/InsertProduct.php",
      headers: {
        Authorization: `Bearer ${token}`
      },
      data: formData
    };
    try {
      const response = await axios.request(config);

      if (response.data.success) {
        toast.success("Producto insertado correctamente.");

        // Limpiar los datos del modal
        setProductData({
          nombre: "",
          unidad: null,
          categoria: null,
          subcategoria: null,
          precioCosto: "",
          precioVenta: "",
          cantidadActual: "",
          cantidadMinima: "",
          imagen: null
        });

        // Redireccionar a otra ruta
        navigate(all_routes.productlist);
      } else {
        toast.error(`Error: ${response.data.message}`);
      }
    } catch (error) {
      toast.error(`Error: ${error.message}`);
    }
  };

  const renderCollapseTooltip = (props) => (
    <Tooltip id="refresh-tooltip" {...props}>
      Collapse
    </Tooltip>
  );

  return (
    <div className="page-wrapper">
      <div className="content">
        <div className="page-header">
          <div className="add-item d-flex">
            <div className="page-title">
              <h4>Nuevo Producto</h4>
              <h6>Crear un nuevo producto</h6>
            </div>
          </div>
          <ul className="table-top-head">
            <li>
              <div className="page-btn">
                <Link to={route.productlist} className="btn btn-secondary">
                  <ArrowLeft className="me-2" />
                  Regresar a Inventario
                </Link>
              </div>
            </li>
            <li>
              <OverlayTrigger placement="top" overlay={renderCollapseTooltip}>
                <Link
                  data-bs-toggle="tooltip"
                  data-bs-placement="top"
                  title="Collapse"
                  id="collapse-header"
                  className={data ? "active" : ""}
                  onClick={() => {
                    dispatch(setToogleHeader(!data));
                  }}
                >
                  <ChevronUp className="feather-chevron-up" />
                </Link>
              </OverlayTrigger>
            </li>
          </ul>
        </div>
        {/* /add */}
        <form>
          <div className="card">
            <div className="card-body add-product pb-0">
              <div
                className="accordion-card-one accordion"
                id="accordionExample"
              >
                <div className="accordion-item">
                  <div className="accordion-header" id="headingOne">
                    <div
                      className="accordion-button"
                      data-bs-toggle="collapse"
                      data-bs-target="#collapseOne"
                      aria-controls="collapseOne"
                    >
                      <div className="addproduct-icon">
                        <h5>
                          <Info className="add-info" />

                          <span>Informacion del Producto</span>
                        </h5>
                        <Link to="#">
                          <ChevronDown className="chevron-down-add" />
                        </Link>
                      </div>
                    </div>
                  </div>
                  <div
                    id="collapseOne"
                    className="accordion-collapse collapse show"
                    aria-labelledby="headingOne"
                    data-bs-parent="#accordionExample"
                  >
                    <div className="accordion-body">
                      <div className="row">
                        <div className="col-lg-4 col-sm-6 col-12">
                          <div className="mb-3 add-product">
                            <label className="form-label">
                              Nombre del Producto
                            </label>
                            <input
                              type="text"
                              className="form-control"
                              value={productData.nombre}
                              onChange={(e) =>
                                handleChange("nombre", e.target.value)
                              }
                            />
                          </div>
                        </div>
                        <div className="col-lg-4 col-sm-6 col-12">
                          <div className="mb-3 add-product">
                            <label className="form-label">Unidad</label>
                            <Select
                              classNamePrefix="react-select"
                              options={unidad}
                              value={productData.unidad}
                              onChange={(selectedOption) =>
                                handleChange("unidad", selectedOption)
                              }
                              placeholder="Elegir"
                            />
                          </div>
                        </div>
                        <div className="col-lg-4 col-sm-6 col-12">
                          <div className="mb-3 add-product">
                            <div className="add-newplus">
                              <label className="form-label">Categoria</label>
                              <Link
                                to="#"
                                data-bs-toggle="modal"
                                data-bs-target="#add-units-category"
                              >
                                <PlusCircle className="plus-down-add" />
                                <span>Añadir</span>
                              </Link>
                            </div>
                            <Select
                              classNamePrefix="react-select"
                              options={category}
                              value={productData.categoria}
                              onChange={(selectedOption) =>
                                handleChange("categoria", selectedOption)
                              }
                              placeholder="Elegir"
                            />
                          </div>
                        </div>
                      </div>
                      <div className="addservice-info">
                        <div className="row">
                          <div className="col-lg-4 col-sm-6 col-12">
                            <div className="mb-3 add-product">
                              <label className="form-label">SubCategoria</label>
                              <Select
                                classNamePrefix="react-select"
                                options={subcategory}
                                value={productData.subcategoria}
                                onChange={(selectedOption) =>
                                  handleChange("subcategoria", selectedOption)
                                }
                                placeholder="Elegir"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div
                className="accordion-card-one accordion"
                id="accordionExample2"
              >
                <div className="accordion-item">
                  <div className="accordion-header" id="headingTwo">
                    <div
                      className="accordion-button"
                      data-bs-toggle="collapse"
                      data-bs-target="#collapseTwo"
                      aria-controls="collapseTwo"
                    >
                      <div className="text-editor add-list">
                        <div className="addproduct-icon list icon">
                          <h5>
                            <LifeBuoy className="add-info" />
                            <span>Precios y Stock</span>
                          </h5>
                          <Link to="#">
                            <ChevronDown className="chevron-down-add" />
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div
                    id="collapseTwo"
                    className="accordion-collapse collapse show"
                    aria-labelledby="headingTwo"
                    data-bs-parent="#accordionExample2"
                  >
                    <div className="accordion-body">
                      <div className="tab-content" id="pills-tabContent">
                        <div
                          className="tab-pane fade show active"
                          id="pills-home"
                          role="tabpanel"
                          aria-labelledby="pills-home-tab"
                        >
                          <div className="row">
                            <div className="col-lg-6 col-sm-6 col-12">
                              <div className="input-blocks add-product">
                                <label>Precio Costo</label>
                                <input
                                  type="text"
                                  className="form-control"
                                  value={productData.precioCosto}
                                  onChange={(e) =>
                                    handleChange("precioCosto", e.target.value)
                                  }
                                />
                              </div>
                            </div>
                            <div className="col-lg-6 col-sm-6 col-12">
                              <div className="input-blocks add-product">
                                <label>Precio Venta</label>
                                <input
                                  type="text"
                                  className="form-control"
                                  value={productData.precioVenta}
                                  onChange={(e) =>
                                    handleChange("precioVenta", e.target.value)
                                  }
                                />
                              </div>
                            </div>
                          </div>
                          <div className="row">
                            <div className="col-lg-6 col-sm-6 col-12">
                              <div className="input-blocks add-product">
                                <label>Cantidad Actual </label>
                                <input
                                  type="text"
                                  className="form-control"
                                  value={productData.cantidadActual}
                                  onChange={(e) =>
                                    handleChange(
                                      "cantidadActual",
                                      e.target.value
                                    )
                                  }
                                />
                              </div>
                            </div>
                            <div className="col-lg-6 col-sm-6 col-12">
                              <div className="input-blocks add-product">
                                <label>Cantidad Minima</label>
                                <input
                                  type="text"
                                  className="form-control"
                                  value={productData.cantidadMinima}
                                  onChange={(e) =>
                                    handleChange(
                                      "cantidadMinima",
                                      e.target.value
                                    )
                                  }
                                />
                              </div>
                            </div>
                            <div
                              className="accordion-card-one accordion"
                              id="accordionExample3"
                            >
                              <div className="accordion-item">
                                <div
                                  className="accordion-header"
                                  id="headingThree"
                                >
                                  <div
                                    className="accordion-button"
                                    data-bs-toggle="collapse"
                                    data-bs-target="#collapseThree"
                                    aria-controls="collapseThree"
                                  >
                                    <div className="addproduct-icon list">
                                      <h5>
                                        <i
                                          data-feather="image"
                                          className="add-info"
                                        />
                                        <span>Images</span>
                                      </h5>
                                      <Link to="#">
                                        <ChevronDown className="chevron-down-add" />
                                      </Link>
                                    </div>
                                  </div>
                                </div>
                                <div
                                  id="collapseThree"
                                  className="accordion-collapse collapse show"
                                  aria-labelledby="headingThree"
                                  data-bs-parent="#accordionExample3"
                                >
                                  <div className="accordion-body">
                                    <div className="text-editor add-list add">
                                      <div className="col-lg-12">
                                        <div className="add-choosen">
                                          <div className="input-blocks">
                                            <div className="image-upload">
                                              <input
                                                type="file"
                                                onChange={handleImageChange}
                                              />
                                              <div className="image-uploads">
                                                <PlusCircle className="plus-down-add me-0" />
                                                <h4>Añadir Imagen</h4>
                                              </div>
                                            </div>
                                          </div>
                                          {previewImage && (
                                            <div className="phone-img">
                                              <img
                                                src={previewImage}
                                                alt="Vista previa"
                                              />
                                              <Link to="#">
                                                <X
                                                  className="x-square-add remove-product"
                                                  onClick={handleRemoveImage}
                                                />
                                              </Link>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="col-lg-12">
            <div className="btn-addproduct mb-4">
              <button type="button" className="btn btn-cancel me-2" onClick={closemodal}>
                Cancelar
              </button>
              <Link className="btn btn-submit" onClick={handleFormSubmit}>
                Guardar
              </Link>
            </div>
          </div>
        </form>
        {/* /add */}
      </div>
      <AddCategory />
    </div>
  );
};

export default AddProduct;
