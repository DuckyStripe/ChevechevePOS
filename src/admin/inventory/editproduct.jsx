import React, { useState, useEffect } from "react";
import { useLocation , Link } from "react-router-dom";
import Select from "react-select";
import AddCategory from "../../core/modals/inventory/addcategory";
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
import {FecthProduct} from "../../Data/Inventario/product"
const EditProduct = () => {
  const location = useLocation();

  // Función para obtener el ID del producto desde los query params
  const getProductIdFromQuery = () => {
    const params = new URLSearchParams(location.search);
    return params.get('id');
  };

  const productId = getProductIdFromQuery();
  const [productData, setProductData] = useState({});
  const [previewImage, setPreviewImage] = useState(true);
  const route = all_routes;
  const dispatch = useDispatch();
  const data = useSelector((state) => state.toggle_header);
  const handleImageChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewImage(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };
  useEffect(() => {
    // Simulación de una llamada para obtener datos del producto por su ID
    const loadInitialData = async () => {
    const product=await FecthProduct(productId);
    setProductData(product);
    setPreviewImage(product.image);
    }
    loadInitialData();
  }, [productId]);
  // Función para eliminar la imagen cargada
  const handleRemoveImage = () => {
    setPreviewImage(null);
  };

  const renderCollapseTooltip = (props) => (
    <Tooltip id="refresh-tooltip" {...props}>
      Collapse
    </Tooltip>
  );
  const category = [
    { value: "Elegir", label: "Elegir" },
    { value: "Modelo", label: "Modelo" },
    { value: "Corona", label: "Corona" }
  ];
  const subcategory = [
    { value: "Elegir", label: "Elegir" },
    { value: "Cuarto", label: "Cuarto" },
    { value: "Media", label: "Media" },
    { value: "Mega", label: "Mega" }
  ];
  const unidad = [
    { value: "0", label: "Elije uno" },
    { value: "Unidad", label: "Unidad/Pieza" },
    { value: "Paquete", label: "Paquete" }
  ];

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
                              value={productData.name || ""}
                              onChange={(e) =>
                                setProductData({
                                  ...productData,
                                  name: e.target.value
                                })
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
                              value={unidad.find(
                                (option) => option.value === productData.unit
                              )}
                              onChange={(selectedOption) =>
                                setProductData({
                                  ...productData,
                                  unit: selectedOption.value
                                })
                              }
                              placeholder="Elegir"
                            />
                          </div>
                        </div>
                        {/* Categoria */}
                        <div className="col-lg-4 col-sm-6 col-12">
                          <div className="mb-3 add-product">
                            <label className="form-label">Categoria</label>
                            <Select
                              classNamePrefix="react-select"
                              options={category}
                              value={category.find(
                                (option) =>
                                  option.value === productData.category
                              )}
                              onChange={(selectedOption) =>
                                setProductData({
                                  ...productData,
                                  category: selectedOption.value
                                })
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
                                value={subcategory.find(
                                  (option) =>
                                    option.value === productData.subcategory
                                )}
                                onChange={(selectedOption) =>
                                  setProductData({
                                    ...productData,
                                    subcategory: selectedOption.value
                                  })
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
                            <div className="col-lg-4 col-sm-6 col-12">
                              <div className="input-blocks add-product">
                                <label>Precio Costo</label>
                                <input
                                  type="text"
                                  className="form-control"
                                  value={productData.price || ""}
                                  onChange={(e) =>
                                    setProductData({
                                      ...productData,
                                      price: e.target.value
                                    })
                                  }
                                />
                              </div>
                            </div>
                            <div className="col-lg-4 col-sm-6 col-12">
                              <div className="input-blocks add-product">
                                <label>Precio Venta</label>
                                <input
                                  type="text"
                                  className="form-control"
                                  value={productData.salePrice || ""}
                                  onChange={(e) =>
                                    setProductData({
                                      ...productData,
                                      salePrice: e.target.value
                                    })
                                  }
                                />
                              </div>
                            </div>
                            <div className="col-lg-4 col-sm-6 col-12">
                              <div className="input-blocks add-product">
                                <label>Precio Mayoreo</label>
                                <input
                                  type="text"
                                  className="form-control"
                                  value={productData.quantity || ""}
                                  onChange={(e) =>
                                    setProductData({
                                      ...productData,
                                      quantity: e.target.value
                                    })
                                  }
                                />
                              </div>
                            </div>
                          </div>
                          <div className="row">
                            <div className="col-lg-4 col-sm-6 col-12">
                              <div className="input-blocks add-product">
                                <label>Cantidad Actual </label>
                                <input
                                  type="text"
                                  className="form-control"
                                  value={productData.quantity || ""}
                                  onChange={(e) =>
                                    setProductData({
                                      ...productData,
                                      quantity: e.target.value
                                    })
                                  }
                                />
                              </div>
                            </div>
                            <div className="col-lg-4 col-sm-6 col-12">
                              <div className="input-blocks add-product">
                                <label>Cantidad Minima</label>
                                <input
                                  type="text"
                                  className="form-control"
                                  value={productData.minQuantity || ""}
                                  onChange={(e) =>
                                    setProductData({
                                      ...productData,
                                      minQuantity: e.target.value
                                    })
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
                                                src={productData.image}
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
              <div
                className="accordion-card-one accordion"
                id="accordionExample4"
              >
                {/* <div className="accordion-item">
                    <div className="accordion-header" id="headingFour">
                      <div
                        className="accordion-button"
                        data-bs-toggle="collapse"
                        data-bs-target="#collapseFour"
                        aria-controls="collapseFour"
                      >
                        <div className="text-editor add-list">
                          <div className="addproduct-icon list">
                            <h5>
                              <List className="add-info" />
                              <span>Custom Fields</span>
                            </h5>
                            <Link to="#">
                              <ChevronDown className="chevron-down-add" />
                            </Link>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div
                      id="collapseFour"
                      className="accordion-collapse collapse show"
                      aria-labelledby="headingFour"
                      data-bs-parent="#accordionExample4"
                    >
                      <div className="accordion-body">
                        <div className="text-editor add-list add">
                          <div className="custom-filed">
                            <div className="input-block add-lists">
                              <label className="checkboxs">
                                <input type="checkbox" />
                                <span className="checkmarks" />
                                Warranties
                              </label>
                              <label className="checkboxs">
                                <input type="checkbox" />
                                <span className="checkmarks" />
                                Manufacturer
                              </label>
                              <label className="checkboxs">
                                <input type="checkbox" />
                                <span className="checkmarks" />
                                Expiry
                              </label>
                            </div>
                          </div>
                          <div className="row">
                            <div className="col-lg-4 col-sm-6 col-12">
                              <div className="input-blocks add-product">
                                <label>Quantity Alert</label>
                                <input type="text" className="form-control" />
                              </div>
                            </div>
                            <div className="col-lg-4 col-sm-6 col-12">
                              <div className="input-blocks">
                                <label>Manufactured Date</label>
                                <div className="input-groupicon calender-input">
                                  <Calendar className="info-img" />
                                  <DatePicker
                                    selected={selectedDate}
                                    onChange={handleDateChange}
                                    type="date"
                                    className="datetimepicker"
                                    dateFormat="dd-MM-yyyy"
                                    placeholder="Elegir Date"
                                  />
                                </div>
                              </div>
                            </div>
                            <div className="col-lg-4 col-sm-6 col-12">
                              <div className="input-blocks">
                                <label>Expiry On</label>
                                <div className="input-groupicon calender-input">
                                  <Calendar className="info-img" />
                                  <DatePicker
                                    selected={selectedDate1}
                                    onChange={handleDateChange1}
                                    type="date"
                                    className="datetimepicker"
                                    dateFormat="dd-MM-yyyy"
                                    placeholder="Elegir Date"
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div> */}
              </div>
            </div>
          </div>
          <div className="col-lg-12">
            <div className="btn-addproduct mb-4">
              <button type="button" className="btn btn-cancel me-2">
                Cancelar
              </button>
              <Link to={route.addproduct} className="btn btn-submit">
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

export default EditProduct;
