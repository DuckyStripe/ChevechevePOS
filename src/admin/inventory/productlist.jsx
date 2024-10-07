import React, { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link } from "react-router-dom";
import Select from "react-select";
import ImageWithBasePath from "../../core/img/imagewithbasebath";
import ImageWithGenericUrlCheve from "../../core/img/imagewithURLCheve";
import { all_routes } from "../../Router/all_routes";
import { OverlayTrigger, Tooltip } from "react-bootstrap";
import Table from "../../core/pagination/datatable";
import { setToogleHeader } from "../../core/redux/action";
import { fetchProducts } from "../../Data/Inventario/products"; // Importa la función del mock
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
  Trash2,
} from "feather-icons-react/build/IconComponents";

const ProductList = () => {
  const [dataSource, setDataSource] = useState([]);
  const [searchValue, setSearchValue] = useState(""); // Estado para el término de búsqueda
  const [filteredData, setFilteredData] = useState([]); // Para almacenar datos filtrados
  const [options, setOptions] = useState({
    Categoria: [],
    Subcategoria: [],
    subCategories: [],
    Unidad: [],
    precio_compra: [],
  });

  const [selectedFilters, setSelectedFilters] = useState({
    Categoria: null,
    Subcategoria: null,
    subCategories: null,
    Unidad: null,
    precio_compra: null,
  });

  useEffect(() => {
    const loadProducts = async () => {
      const products = await fetchProducts();
      setOptions(products.options);
      setDataSource(products.data);
      setFilteredData(products.data);
    };
    loadProducts();
  }, []);

  const handleSearchChange = (event) => {
    const value = event.target.value;
    setSearchValue(value);

    // Filtrar los productos en base al término de búsqueda
    const filtered = dataSource.filter((nombre_producto) =>
      nombre_producto.nombre_producto
        .toLowerCase()
        .includes(value.toLowerCase())
    );
    setFilteredData(filtered);
  };
  const handleSelectChange = (field) => (selectedOption) => {
    setSelectedFilters((prevFilters) => ({
      ...prevFilters,
      [field]: selectedOption ? selectedOption.value : null,
    }));
  };
  const handleSearch = () => {
    // Filtro de productos según los filtros seleccionados
    const filteredProducts = dataSource.filter((nombre_producto) => {
      return (
        (!selectedFilters.Categoria ||
          nombre_producto.Categoria.toLowerCase() ===
            selectedFilters.Categoria.toLowerCase()) &&
        (!selectedFilters.Subcategoria ||
          (nombre_producto.Subcategoria &&
            nombre_producto.Subcategoria.toLowerCase() ===
              selectedFilters.Subcategoria.toLowerCase())) &&
        (!selectedFilters.Unidad ||
          nombre_producto.Unidad.toLowerCase() ===
            selectedFilters.Unidad.toLowerCase()) &&
        (!selectedFilters.precio_compra ||
          nombre_producto.precio_compra === selectedFilters.precio_compra)
      );
    });

    // Actualiza el estado con los productos filtrados
    setFilteredData(filteredProducts);
  };

  const handlePdfDownload = () => {
    const columns = [
      { header: "ID", dataKey: "id" },
      { header: "Producto", dataKey: "nombre_producto" },
      { header: "Categoría", dataKey: "Categoria" },
      { header: "Subcategoría", dataKey: "Subcategoria" },
      { header: "Unidad", dataKey: "Unidad" },
      { header: "Precio de Compra", dataKey: "precio_compra" },
      { header: "Precio de Venta", dataKey: "precio_venta" },
      { header: "Cantidad", dataKey: "cantidad" },
      { header: "Cantidad Mínima", dataKey: "cantidadMinima" },
      { header: "Creado En", dataKey: "creado_en" },
      { header: "Nombre del Usuario", dataKey: "nombre_usuario" },
      { header: "Fecha de Actualización", dataKey: "FechaActualizacion" }
    ];

    // Formatea las fechas a un formato más legible
    const formatDateString = (dateString) => {
      const options = { year: 'numeric', month: 'long', day: 'numeric' };
      return new Date(dateString).toLocaleDateString(undefined, options);
    };

    // Ajusta el cuerpo de los datos, formatea las fechas
    const preparedData = dataSource.map(item => ({
      ...item,
      creado_en: formatDateString(item.creado_en),
      FechaActualizacion: formatDateString(item.FechaActualizacion)
    }));

    // Obtiene la fecha actual para incluir en el nombre del archivo
    const today = new Date();
    const formattedDate = today.toISOString().slice(0, 10); // yyyy-mm-dd

    // Crea un nuevo documento PDF con orientación "landscape"
    const doc = new jsPDF('landscape');

    // Usa autotable para agregar la tabla al documento
    doc.autoTable({
      columns,
      body: preparedData, // Usa el cuerpo de datos preparados
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
      { title: "ID", dataIndex: "id" },
      { title: "Producto", dataIndex: "nombre_producto" },
      { title: "Categoría", dataIndex: "Categoria" },
      { title: "Subcategoría", dataIndex: "Subcategoria" },
      { title: "Unidad", dataIndex: "Unidad" },
      { title: "Precio de Compra", dataIndex: "precio_compra" },
      { title: "Precio de Venta", dataIndex: "precio_venta" },
      { title: "Cantidad", dataIndex: "cantidad" },
      { title: "Cantidad Mínima", dataIndex: "cantidadMinima" },
      { title: "Creado En", dataIndex: "creado_en" },
      { title: "Nombre del Usuario", dataIndex: "nombre_usuario" },
      { title: "Fecha de Actualización", dataIndex: "FechaActualizacion" }
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
      dataIndex: "nombre_producto",
      render: (text, record) => (
        <span className="productimgname">
          <ImageWithGenericUrlCheve
            alt=""
            src={record.imagen_producto}
            width={50} // Establece el ancho en píxeles
            height={50} // Establece el alto en píxeles
          />
          <p>{text}</p>
        </span>
      ),
      sorter: (a, b) => a.nombre_producto.length - b.nombre_producto.length,
    },
    {
      title: "Categoria",
      dataIndex: "Categoria",
      sorter: (a, b) => a.Categoria.length - b.Categoria.length,
    },
    {
      title: "SubCategoria",
      dataIndex: "Subcategoria",
      sorter: (a, b) => a.Subcategoria.length - b.Subcategoria.length,
    },
    {
      title: "Precio",
      dataIndex: "precio_compra",
      sorter: (a, b) =>
        a.precio_compra.localeCompare(b.precio_compra, undefined, {
          numeric: true,
        }),
    },
    {
      title: "Unidades",
      dataIndex: "Unidad",
      sorter: (a, b) => a.Unidad - b.Unidad,
    },
    {
      title: "Catidad",
      dataIndex: "cantidad",
      sorter: (a, b) => a.cantidad - b.cantidad,
    },
    {
      title: "Creeado por",
      dataIndex: "nombre_usuario",
      render: (text) => (
        <span className="userimgname">
          <p>{text}</p>
        </span>
      ),
      sorter: (a, b) => a.nombre_usuario.length - b.nombre_usuario.length,
    },
    {
      title: "Action",
      dataIndex: "action",
      render: (text, record) => (
        <div className="action-table-data">
          <div className="edit-delete-action">
            <Link
              className="me-2 p-2"
              to={`${route.editproduct}?id=${record.id}`}
            >
              <Edit className="feather-edit" />
            </Link>
            <Link
              className="confirm-text p-2"
              to="#"
              onClick={() => showConfirmationAlert(record.id)}
            >
              <Trash2 className="feather-trash-2" />
            </Link>
          </div>
        </div>
      ),
    },
  ];
  const MySwal = withReactContent(Swal);

  const showConfirmationAlert = (id) => {
    MySwal.fire({
      title: "¿Estas seguro?",
      text: "Esta accion no se puede revertir",
      showCancelButton: true,
      confirmButtonColor: "#00ff00",
      confirmButtonText: `Si, Borralo ${id}`,
      cancelButtonColor: "#ff0000",
      cancelButtonText: "Cancelar",
    }).then((result) => {
      if (result.isConfirmed) {
        MySwal.fire({
          title: "Deleted!",
          text: "Your file has been deleted.",
          className: "btn btn-success",
          confirmButtonText: "OK",
          customClass: {
            confirmButton: "btn btn-success",
          },
        });
      } else {
        MySwal.close();
      }
    });
  };
  const resetFilters = () => {
    setSearchValue("");
    setSelectedFilters({
      Categoria: null,
      Subcategoria: null,
      Unidad: null,
      precio_compra: null
    });
    setFilteredData(dataSource);
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
                            options={options.Categoria} // Asegúrate de usar 'Categoria'
                            placeholder="Elegir Categoría"
                            onChange={handleSelectChange("Categoria")}
                            value={
                              options.Categoria?.find(
                                (option) =>
                                  option.value === selectedFilters.Categoria
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
                            options={options.Subcategoria} // Asegúrate de usar 'Subcategoria'
                            placeholder="Elegir Subcategoría"
                            onChange={handleSelectChange("Subcategoria")} // Asegúrate de que este campo también usa 'Subcategoria'
                            value={
                              options.Subcategoria?.find(
                                (option) =>
                                  option.value === selectedFilters.Subcategoria
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
                            options={options.Unidad}
                            placeholder="Elegir Unidad"
                            onChange={handleSelectChange("Unidad")}
                            value={
                              options.Unidad?.find(
                                (option) =>
                                  option.value === selectedFilters.Unidad
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
                            options={options.precio_compra}
                            placeholder="Elegir Precio"
                            onChange={handleSelectChange("precio_compra")}
                            value={
                              options.precio_compra?.find(
                                (option) =>
                                  option.value === selectedFilters.precio_compra
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
      </div>
    </div>
  );
};

export default ProductList;
