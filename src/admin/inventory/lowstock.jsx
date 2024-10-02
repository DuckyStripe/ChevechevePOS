import React, { useState, useEffect } from "react";
import { OverlayTrigger, Tooltip } from "react-bootstrap";
import { Link } from "react-router-dom";
import ImageWithBasePath from "../../core/img/imagewithbasebath";
import {
  RotateCcw,
  Filter,
  GitMerge,
  StopCircle
} from "feather-icons-react/build/IconComponents";
import Select from "react-select";
import EditLowStock from "../../core/modals/inventory/editlowstock";
import Table from "../../core/pagination/datatable";
import {
  fetchLowStock,
  fetchOUTStock,
  fetchOptions
} from "../../Data/Inventario/lowstock"; // I

const LowStock = () => {
  const [dataSource, setDataSource] = useState([]);
  const [searchValue, setSearchValue] = useState(""); // Estado para el término de búsqueda
  const [filteredData, setFilteredData] = useState([]); // Para almacenar datos filtrados
  const [options, setOptions] = useState({
    products: [],
    categories: [],
    subCategories: [],
    brands: [],
    prices: []
  });
  const [selectedFilters, setSelectedFilters] = useState({
    product: null,
    category: null,
    subCategory: null,
    brand: null,
    price: null
  });

  useEffect(() => {
    // Esta función se ejecuta cuando el componente se monta
    const loadInitialData = async () => {
      const products = await fetchLowStock(); // Cargar por defecto los productos con bajo inventario
      setDataSource(products);
      setFilteredData(products);
    };
    // Cargar opciones (solo si esto es necesario)
    const loadOptions = async () => {
      const options = await fetchOptions();
      setOptions(options)
    };

    loadInitialData();
    loadOptions();
  }, []);

  const handleFetchLowStock = async () => {
    const products = await fetchLowStock();
    setDataSource(products);
    setFilteredData(products);
  };

  const handleFetchOutStock = async () => {
    const products = await fetchOUTStock();
    setDataSource(products);
    setFilteredData(products);
  };

  const handleSearchChange = (event) => {
    const value = event.target.value.toLowerCase();
    setSearchValue(value);
  console.log(value)
    const filtered = dataSource.filter((product) =>
      product.product.toLowerCase().includes(value)
    );
    console.log(filtered)
    setFilteredData(filtered);
  };
  const handleSelectChange = (field) => (selectedOption) => {
    setSelectedFilters((prevFilters) => ({
      ...prevFilters,
      [field]: selectedOption ? selectedOption.value : null
    }));
  };
  const handleSearch = () => {
    const filteredProducts = dataSource.filter((product) => {
      return (
        (!selectedFilters.category ||
          product.category.toLowerCase() ===
            selectedFilters.category.toLowerCase()) &&
        (!selectedFilters.subCategory ||
          (product.subCategory &&
            product.subCategory.toLowerCase() ===
              selectedFilters.subCategory.toLowerCase())) &&
        (!selectedFilters.brand ||
          product.brand.toLowerCase() ===
            selectedFilters.brand.toLowerCase()) &&
        (!selectedFilters.price ||
          parseFloat(product.price.replace('$', '')) === 
          parseFloat(selectedFilters.price.replace('$', '')))
      );
    });
  
    setFilteredData(filteredProducts);
  };

  const [isFilterVisible, setIsFilterVisible] = useState(false);
  const toggleFilterVisibility = () => {
    setIsFilterVisible((prevVisibility) => !prevVisibility);
  };
  const resetFilters = () => {
    setSearchValue(""); // Limpia el campo de búsqueda
    setSelectedFilters({
      product: null,
      category: null,
      subCategory: null,
      brand: null,
      price: null
    });
    setFilteredData(dataSource); // Restaura la lista original de productos
  };

  const columns = [
    {
      title: "Producto",
      dataIndex: "product",
      render: (text, record) => (
        <span className="productimgname">
          <ImageWithBasePath
            alt=""
            src={record.productImage}
            width={50} // Establece el ancho en píxeles
            height={50} // Establece el alto en píxeles
          />
          <p>{text}</p>
        </span>
      ),
      sorter: (a, b) => a.product.length - b.product.length
    },
    {
      title: "Categoria",
      dataIndex: "category",
      sorter: (a, b) => a.category.length - b.category.length
    },
    {
      title: "SubCategoria",
      dataIndex: "brand",
      sorter: (a, b) => a.brand.length - b.brand.length
    },
    {
      title: "Precio",
      dataIndex: "price",
      sorter: (a, b) =>
        a.price.localeCompare(b.price, undefined, { numeric: true })
    },
    {
      title: "Unidades",
      dataIndex: "unit",
      sorter: (a, b) => a.unit - b.unit
    },
    {
      title: "Catidad",
      dataIndex: "qty",
      sorter: (a, b) => a.qty - b.qty
    },
    {
      title: "Creeado por",
      dataIndex: "createdby",
      render: (text) => (
        <span className="userimgname">
          <p>{text}</p>
        </span>
      ),
      sorter: (a, b) => a.createdby.length - b.createdby.length
    }
  ];


  const renderTooltip = (props) => (
    <Tooltip id="pdf-tooltip" {...props}>
      Pdf
    </Tooltip>
  );
  const renderExcelTooltip = (props) => (
    <Tooltip id="excel-tooltip" {...props}>
      Excel
    </Tooltip>
  );
  const renderPrinterTooltip = (props) => (
    <Tooltip id="printer-tooltip" {...props}>
      Printer
    </Tooltip>
  );
  const renderRefreshTooltip = (props) => (
    <Tooltip id="refresh-tooltip" {...props}>
      Refresh
    </Tooltip>
  );
  return (
    <div>
      <div className="page-wrapper">
        <div className="content">
          <div className="page-header">
            <div className="page-title me-auto">
              <h4>Productos bajos en Inventario</h4>
              <h6>Visualiza los productos bajos en inventario</h6>
            </div>
            <ul className="table-top-head">
              <li>
                <div className="status-toggle d-flex justify-content-between align-items-center">
                  <input
                    type="checkbox"
                    id="user2"
                    className="check"
                    defaultChecked="true"
                  />
                  <label htmlFor="user2" className="checktoggle">
                    checkbox
                  </label>
                  Notify
                </div>
              </li>
              <li>
                <OverlayTrigger placement="top" overlay={renderTooltip}>
                  <Link>
                    <ImageWithBasePath
                      src="assets/img/icons/pdf.svg"
                      alt="img"
                    />
                  </Link>
                </OverlayTrigger>
              </li>
              <li>
                <OverlayTrigger placement="top" overlay={renderExcelTooltip}>
                  <Link data-bs-toggle="tooltip" data-bs-placement="top">
                    <ImageWithBasePath
                      src="assets/img/icons/excel.svg"
                      alt="img"
                    />
                  </Link>
                </OverlayTrigger>
              </li>
              <li>
                <OverlayTrigger placement="top" overlay={renderPrinterTooltip}>
                  <Link data-bs-toggle="tooltip" data-bs-placement="top">
                    <i data-feather="printer" className="feather-printer" />
                  </Link>
                </OverlayTrigger>
              </li>
              <li>
                <OverlayTrigger placement="top" overlay={renderRefreshTooltip}>
                  <Link data-bs-toggle="tooltip" data-bs-placement="top">
                    <RotateCcw />
                  </Link>
                </OverlayTrigger>
              </li>
            </ul>
          </div>
          <div className="table-tab">
            <ul className="nav nav-pills" id="pills-tab" role="tablist">
              <li className="nav-item" role="presentation">
                <button
                  className="nav-link active"
                  id="pills-home-tab"
                  data-bs-toggle="pill"
                  data-bs-target="#pills-home"
                  type="button"
                  role="tab"
                  aria-controls="pills-home"
                  aria-selected="true"
                  onClick={handleFetchLowStock}
                >
                  Inventario Bajo
                </button>
              </li>
              <li className="nav-item" role="presentation">
                <button
                  className="nav-link"
                  id="pills-profile-tab"
                  data-bs-toggle="pill"
                  data-bs-target="#pills-profile"
                  type="button"
                  role="tab"
                  aria-controls="pills-profile"
                  aria-selected="false"
                  onClick={handleFetchOutStock}
                >
                  Sin Inventario
                </button>
              </li>
            </ul>
            <div className="tab-content" id="pills-tabContent">
              <div
                className="tab-pane fade show active"
                id="pills-home"
                role="tabpanel"
                aria-labelledby="pills-home-tab"
              >
                {/* /product list */}
                <div className="card table-list-card">
                  <div className="card-body">
                    <div className="table-top">
                      <div className="search-set">
                        <div className="search-input">
                          <input
                            type="text"
                            placeholder="Buscar"
                            className="form-control form-control-sm formsearch"
                            value={searchValue}
                            onChange={handleSearchChange}
                          />
                          <Link to className="btn btn-searchset">
                            <i
                              data-feather="search"
                              className="feather-search"
                            />
                          </Link>
                        </div>
                      </div>
                      <div className="search-path">
                        <Link
                          className={`btn btn-filter ${
                            isFilterVisible ? "setclose" : ""
                          }`}
                          id="filter_search"
                        >
                          <Filter
                            className="filter-icon"
                            onClick={toggleFilterVisibility}
                          />
                          <span onClick={toggleFilterVisibility}>
                            <ImageWithBasePath
                              src="assets/img/icons/closes.svg"
                              alt="img"
                            />
                          </span>
                        </Link>
                      </div>
                    </div>
                    {/* /Filter */}
                    <div
                      className={`card${isFilterVisible ? " visible" : ""}`}
                      id="filter_inputs"
                      style={{ display: isFilterVisible ? "block" : "none" }}
                    >
                      {" "}
                      <div className="card-body pb-0">
                        <div className="row">
                          <div className="col-lg-1 col-sm-6 col-12">
                            <div className="input-blocks"></div>
                          </div>
                          <div className="col-lg-2 col-sm-6 col-12">
                            <div className="input-blocks">
                              <StopCircle className="info-img" />
                              <Select
                                className="img-select"
                                classNamePrefix="react-select"
                                options={options.categories} // Asegúrate de usar 'categories', no 'category'
                                placeholder="Elegir Categoría"
                                onChange={handleSelectChange("category")} // Usa la clave correcta
                                value={
                                  options.categories?.find(
                                    (option) =>
                                      option.value === selectedFilters.category
                                  ) || null
                                }
                              />
                            </div>
                          </div>
                          <div className="col-lg-2 col-sm-6 col-12">
                            <div className="input-blocks">
                              <GitMerge className="info-img" />
                              <Select
                                className="img-select"
                                classNamePrefix="react-select"
                                options={options.subCategories}
                                placeholder="Elegir Subcategoría"
                                onChange={handleSelectChange("subCategory")}
                                value={
                                  options.subCategories?.find(
                                    (option) =>
                                      option.value ===
                                      selectedFilters.subCategory
                                  ) || null
                                }
                              />
                            </div>
                          </div>
                          <div className="col-lg-2 col-sm-6 col-12">
                            <div className="input-blocks">
                              <StopCircle className="info-img" />
                              <Select
                                className="img-select"
                                classNamePrefix="react-select"
                                options={options.brands}
                                placeholder="Elegir Marca"
                                onChange={handleSelectChange("brand")}
                                value={
                                  options.brands?.find(
                                    (option) =>
                                      option.value === selectedFilters.brand
                                  ) || null
                                }
                              />
                            </div>
                          </div>
                          <div className="col-lg-2 col-sm-6 col-12">
                            <div className="input-blocks">
                              <i className="fas fa-money-bill info-img" />
                              <Select
                                className="img-select"
                                classNamePrefix="react-select"
                                options={options.prices}
                                placeholder="Elegir Precio"
                                onChange={handleSelectChange("price")}
                                value={
                                  options.prices?.find(
                                    (option) =>
                                      option.value === selectedFilters.price
                                  ) || null
                                }
                              />
                            </div>
                          </div>

                          <div className="col-lg-1 col-sm-6 col-12">
                            <div className="input-blocks">
                              <button
                                className="btn btn-filters ms-auto"
                                onClick={handleSearch}
                              >
                                <i
                                  data-feather="search"
                                  className="feather-search"
                                />
                                Buscar
                              </button>
                            </div>
                          </div>
                          <div className="col-lg-1 col-sm-6 col-12">
                            <div className="input-blocks">
                              <button
                                className="btn btn-filters ms-auto" // Añade alguna clase CSS si necesitas estilos específicos
                                onClick={resetFilters}
                              >
                                <i
                                  data-feather="rotate-ccw" // Usa un icono adecuado según tu necesidad, aquí como ejemplo
                                  className="feather-rotate-ccw"
                                />
                                Limpiar
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    {/* /Filter */}
                    <div className="table-responsive">
                      <Table columns={columns} dataSource={filteredData} />
                    </div>
                  </div>
                </div>
                {/* /product list */}
              </div>
              <div
                className="tab-pane fade"
                id="pills-profile"
                role="tabpanel"
                aria-labelledby="pills-profile-tab"
              >
                {/* /product list */}
                <div className="card table-list-card">
                  <div className="card-body">
                    <div className="table-top">
                      <div className="search-set">
                        <div className="search-input">
                          <input
                            type="text"
                            placeholder="Search"
                            className="form-control form-control-sm formsearch"
                          />
                          <Link to className="btn btn-searchset">
                            <i
                              data-feather="search"
                              className="feather-search"
                            />
                          </Link>
                        </div>
                      </div>
                      <div className="search-path">
                        <Link
                          className={`btn btn-filter ${
                            isFilterVisible ? "setclose" : ""
                          }`}
                          id="filter_search"
                        >
                          <Filter
                            className="filter-icon"
                            onClick={toggleFilterVisibility}
                          />
                          <span onClick={toggleFilterVisibility}>
                            <ImageWithBasePath
                              src="assets/img/icons/closes.svg"
                              alt="img"
                            />
                          </span>
                        </Link>
                      </div>
                    </div>
                    {/* /Filter */}
                    <div className="card" id="filter_inputs1">
                      <div className="card-body pb-0">
                        <div className="row">
                          <div className="col-lg-3 col-sm-6 col-12">
                            <div className="input-blocks">
                              <i data-feather="box" className="info-img" />
                              <select className="react-select">
                                <option>Choose Product</option>
                                <option>Lenovo 3rd Generation </option>
                                <option>Nike Jordan</option>
                                <option>Amazon Echo Dot </option>
                              </select>
                            </div>
                          </div>
                          <div className="col-lg-3 col-sm-6 col-12">
                            <div className="input-blocks">
                              <i data-feather="zap" className="info-img" />
                              <select className="react-select">
                                <option>Choose Category</option>
                                <option>Laptop</option>
                                <option>Shoe</option>
                                <option>Speaker</option>
                              </select>
                            </div>
                          </div>
                          <div className="col-lg-3 col-sm-6 col-12">
                            <div className="input-blocks">
                              <i data-feather="archive" className="info-img" />
                              <select className="react-select">
                                <option>Choose Warehouse</option>
                                <option>Lavish Warehouse </option>
                                <option>Lobar Handy </option>
                                <option>Traditional Warehouse </option>
                              </select>
                            </div>
                          </div>
                          <div className="col-lg-3 col-sm-6 col-12 ms-auto">
                            <div className="input-blocks">
                              <Link className="btn btn-filters ms-auto">
                                {" "}
                                <i
                                  data-feather="search"
                                  className="feather-search"
                                />{" "}
                                Search{" "}
                              </Link>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    {/* /Filter */}
                    <div className="table-responsive">
                      <Table columns={columns} dataSource={filteredData} />
                    </div>
                  </div>
                </div>
                {/* /product list */}
              </div>
            </div>
          </div>
        </div>
      </div>
      <EditLowStock />
    </div>
  );
};

export default LowStock;
