import React, { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link } from "react-router-dom";
import Select from "react-select";
import ImageWithBasePath from "../../core/img/imagewithbasebath";
import Brand from "../../core/modals/inventory/brand";
import { all_routes } from "../../Router/all_routes";
import { OverlayTrigger, Tooltip } from "react-bootstrap";
import Table from "../../core/pagination/datatable";
import { setToogleHeader } from "../../core/redux/action";
import { fetchProducts, fetchOptions } from "../../Data/Inventario/products"; // Importa la función del mock
import withReactContent from "sweetalert2-react-content";
import Swal from "sweetalert2";
import jsPDF from "jspdf";
import "jspdf-autotable";
import * as XLSX from "xlsx";

// Iconos
import {
  ChevronUp,
  Edit,
  Filter,
  GitMerge,
  PlusCircle,
  RotateCcw,
  StopCircle,
  Trash2
} from "feather-icons-react/build/IconComponents";

const ProductList = () => {
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
    const loadProducts = async () => {
      const products = await fetchProducts();
      setDataSource(products);
      setFilteredData(products);
    };
    const loadOptions = async () => {
      const data = await fetchOptions();
      setOptions(data);
    };

    loadOptions();
    loadProducts();
  }, []);

  const handleSearchChange = (event) => {
    const value = event.target.value;
    setSearchValue(value);

    // Filtrar los productos en base al término de búsqueda
    const filtered = dataSource.filter((product) =>
      product.product.toLowerCase().includes(value.toLowerCase())
    );
    setFilteredData(filtered);
  };
  const handleSelectChange = (field) => (selectedOption) => {
    setSelectedFilters((prevFilters) => ({
      ...prevFilters,
      [field]: selectedOption ? selectedOption.value : null
    }));
  };
  const handleSearch = () => {
    console.log("dataSource:", dataSource);
    // Filtro de productos según los filtros seleccionados
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
        (!selectedFilters.price || product.price === selectedFilters.price)
      );
    });

    // Actualiza el estado con los productos filtrados
    setFilteredData(filteredProducts);
    console.log("Filtered Products:", filteredProducts);
  };

  const handlePdfDownload = () => {
    const columns = [
      { header: "Producto", dataKey: "product" },
      { header: "Categoria", dataKey: "category" },
      { header: "SubCategoria", dataKey: "brand" },
      { header: "Precio", dataKey: "price" },
      { header: "Unidades", dataKey: "unit" },
      { header: "Catidad", dataKey: "qty" },
      { header: "Creeado por", dataKey: "createdby" }
    ];
  
    // Obtiene la fecha actual para incluir en el nombre del archivo
    const today = new Date();
    const formattedDate = today.toISOString().slice(0, 10); // yyyy-mm-dd
  
    // Crea un nuevo documento PDF
    const doc = new jsPDF();
    
    // Usa autotable para agregar la tabla al documento
    doc.autoTable({
      columns,
      body: dataSource, // Usa tus datos del mockup
      styles: { halign: 'center' }, // Opcional: centrar el contenido
      headStyles: { fillColor: [233, 30, 99] }, // Opcional: color de la cabecera
    });
  
    // Guarda el PDF con el nombre que incluye la fecha
    const fileName = `Inventario_${formattedDate}.pdf`;
    doc.save(fileName);
  };

  const handleExcelExport = () => {
    // Define las columnas que quieres usar en el archivo Excel
    const columns = [
      { title: "Producto", dataIndex: "product" },
      { title: "Categoria", dataIndex: "category" },
      { title: "SubCategoria", dataIndex: "brand" },
      { title: "Precio", dataIndex: "price" },
      { title: "Unidades", dataIndex: "unit" },
      { title: "Catidad", dataIndex: "qty" },
      { title: "Creeado por", dataIndex: "createdby" }
    ];

    // Extrae las filas de datos basadas en dataSource
    const data = dataSource.map((item) =>
      columns.map((col) => item[col.dataIndex])
    );

    // Prepara los encabezados del archivo Excel
    const headers = columns.map((col) => col.title);

    // Combina los encabezados y los datos
    const sheetData = [headers, ...data];

    // Crea la hoja de cálculo
    const worksheet = XLSX.utils.aoa_to_sheet(sheetData);

    // Crea y descarga el archivo Excel
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Productos");
    const today = new Date();
    const formattedDate = today.toISOString().slice(0, 10); // yyyy-mm-dd

    // Incluye la fecha en el nombre del archivo
    const fileName = `productos_${formattedDate}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  const handlePrint = () => {
    window.print();
    console.log("Contenido impreso");
  };

  const dispatch = useDispatch();
  const data = useSelector((state) => state.toggle_header);

  const [isFilterVisible, setIsFilterVisible] = useState(false);
  const toggleFilterVisibility = () => {
    setIsFilterVisible((prevVisibility) => !prevVisibility);
  };

  const route = all_routes;

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
    },
    {
      title: "Action",
      dataIndex: "action",
      render: () => (
        <div className="action-table-data">
          <div className="edit-delete-action">
            <div className="input-block add-lists"></div>
            <Link className="me-2 p-2" to={route.editproduct}>
              <Edit className="feather-edit" />
            </Link>
            <Link
              className="confirm-text p-2"
              to="#"
              onClick={showConfirmationAlert}
            >
              <Trash2 className="feather-trash-2" />
            </Link>
          </div>
        </div>
      ),
      sorter: (a, b) => a.createdby.length - b.createdby.length
    }
  ];
  const MySwal = withReactContent(Swal);

  const showConfirmationAlert = () => {
    MySwal.fire({
      title: "¿Estas seguro?",
      text: "Esta accion no se puede revertir",
      showCancelButton: true,
      confirmButtonColor: "#00ff00",
      confirmButtonText: "Si, Borralo",
      cancelButtonColor: "#ff0000",
      cancelButtonText: "Cancelar"
    }).then((result) => {
      if (result.isConfirmed) {
        MySwal.fire({
          title: "Deleted!",
          text: "Your file has been deleted.",
          className: "btn btn-success",
          confirmButtonText: "OK",
          customClass: {
            confirmButton: "btn btn-success"
          }
        });
      } else {
        MySwal.close();
      }
    });
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

  const renderCollapseTooltip = (props) => (
    <Tooltip id="collapse-tooltip" {...props}>
      Collapse
    </Tooltip>
  );

  return (
    <div className="page-wrapper">
      <div className="content">
        <div className="page-header">
          <div className="add-item d-flex">
            <div className="page-title">
              <h4>Inventario</h4>
              <h6>Gestiona tu inventario</h6>
            </div>
          </div>
          <ul className="table-top-head">
            <li>
              <OverlayTrigger placement="top" overlay={renderTooltip}>
                <Link onClick={handlePdfDownload}>
                  <ImageWithBasePath src="assets/img/icons/pdf.svg" alt="img" />
                </Link>
              </OverlayTrigger>
            </li>
            <li>
              <OverlayTrigger placement="top" overlay={renderExcelTooltip}>
                <Link onClick={handleExcelExport}>
                  <ImageWithBasePath
                    src="assets/img/icons/excel.svg"
                    alt="img"
                  />
                </Link>
              </OverlayTrigger>
            </li>
            <li>
              <OverlayTrigger placement="top" overlay={renderPrinterTooltip}>
                <Link onClick={handlePrint}>
                  <i data-feather="printer" className="feather-printer" />
                </Link>
              </OverlayTrigger>
            </li>
            <li>
              <OverlayTrigger placement="top" overlay={renderRefreshTooltip}>
                <Link onClick={() => setDataSource(fetchProducts)}>
                  <RotateCcw />
                </Link>
              </OverlayTrigger>
            </li>
            <li>
              <OverlayTrigger placement="top" overlay={renderCollapseTooltip}>
                <Link
                  onClick={(e) => {
                    e.preventDefault();
                    dispatch(setToogleHeader(!data));
                  }}
                  className={data ? "active" : ""}
                >
                  <ChevronUp />
                </Link>
              </OverlayTrigger>
            </li>
          </ul>
          <div className="page-btn">
            <Link to={route.addproduct} className="btn btn-added">
              <PlusCircle className="me-2 iconsize" />
              Añadir Producto
            </Link>
          </div>
        </div>

        <div className="card table-list-card">
          <div className="card-body">
            {/* Búsqueda y Filtros */}
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
                  <Link className="btn btn-searchset">
                    <i data-feather="search" className="feather-search" />
                  </Link>
                </div>
              </div>
              <div className="search-path">
                <Link
                  className={`btn btn-filter ${
                    isFilterVisible ? "setclose" : ""
                  }`}
                  onClick={toggleFilterVisibility}
                >
                  <Filter className="filter-icon" />
                  <span>
                    <ImageWithBasePath
                      src="assets/img/icons/closes.svg"
                      alt="img"
                    />
                  </span>
                </Link>
              </div>
            </div>

            <div
              className={`card${isFilterVisible ? " visible" : ""}`}
              style={{ display: isFilterVisible ? "block" : "none" }}
            >
              <div className="card-body pb-0">
                <div className="row">
                  <div className="col-lg-12 col-sm-12">
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
                                  option.value === selectedFilters.subCategory
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
              </div>
            </div>

            <div className="table-responsive">
              <Table columns={columns} dataSource={filteredData} />
            </div>
          </div>
        </div>
        {/* /Product list */}
        <Brand />
      </div>
    </div>
  );
};

export default ProductList;
