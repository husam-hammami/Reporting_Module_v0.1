// import Table from '@mui/material/Table';
// import TableBody from '@mui/material/TableBody';
// import TableCell from '@mui/material/TableCell';
// import TableContainer from '@mui/material/TableContainer';
// import TableHead from '@mui/material/TableHead';
// import TableRow from '@mui/material/TableRow';
// import Paper from '@mui/material/Paper';
// import {
//   Checkbox,
//   FormControl,
//   InputLabel,
//   MenuItem,
//   Select,
// } from '@mui/material';
// import ActionButton from './ActionButton';
// import { useContext, useState } from 'react';
// import { AuthContext } from '../../Context/AuthProvider';

// function TableData({ headers, data, dataKeys, actions, useFilter }) {
//   const { auth } = useContext(AuthContext);
//   const [filter, setFilter] = useState(useFilter?.options[0].value || '');

//   // Handle filter change
//   const handleFilterChange = async event => {
//     setFilter(event.target.value);
//   };

//   return (
//     <Paper className="w-full mt-5 !bg-zinc-100 dark:!bg-zinc-800 !rounded-lg">
//       <TableContainer
//         className="overflow-x-auto rounded-lg shadow-md"
//         sx={{ minWidth: 550 }}
//       >
//         {/* Filter Section */}
//         {useFilter && (
//           <div className="flex justify-center items-center p-2">
//             <span className="me-2">Filter By: </span>
//             <FormControl variant="outlined" className="w-48">
//               <InputLabel>{useFilter.filterName}</InputLabel>
//               <Select
//                 value={filter}
//                 onChange={handleFilterChange}
//                 label="Filter By"
//               >
//                 {useFilter.options?.map((option, index) => (
//                   <MenuItem key={index} value={option.value}>
//                     {option.label}
//                   </MenuItem>
//                 ))}
//               </Select>
//             </FormControl>
//           </div>
//         )}

//         {/* Table Structure */}
//         <Table className="w-full">
//           {/* Table Header */}
// <TableHead className="p-3 bg-zinc-400 dark:bg-zinc-700">
//   <TableRow>
//     {headers?.map((header, index) => (
//       <TableCell
//         key={index}
//         className="2xl:!text-xl !font-bold 2xl:!tracking-widest !tracking-wider text-zinc-900 dark:text-zinc-100 max-2xl:!py-2"
//       >
//         {header}
//       </TableCell>
//     ))}
//     {window.location.pathname === '/job-type' && (  // Conditional rendering
//       <TableCell className="2xl:!text-xl !font-bold 2xl:!tracking-widest !tracking-wider text-zinc-900 dark:text-zinc-100 max-2xl:!py-2">
//         Bit Value
//       </TableCell>
//     )}
//     {actions && (
//       <TableCell 
//         className="2xl:!text-xl !font-bold 2xl:!tracking-widest !tracking-wider text-zinc-900 dark:text-zinc-100 max-2xl:!py-2"
//         align="right"
//       >
//         Actions
//       </TableCell>
//     )}
//   </TableRow>
// </TableHead>

//           {/* Table Body */}
//           <TableBody>
//             {/* No Data Available */}
//             {data && data.length === 0 ? (
//               <TableRow>
//                 <TableCell
//                   colSpan={headers.length + (actions ? 2 : 1)} 
//                   className="text-center text-lg text-gray-600 dark:text-gray-400"
//                 >
//                   <div className="flex flex-col w-full items-center justify-center py-4">
//                     <h1 className="mt-4 text-xl font-medium text-gray-600 dark:text-gray-300">
//                       No Data Available
//                     </h1>
//                   </div>
//                 </TableCell>
//               </TableRow>
//             ) : (
//               data?.map((row, rowIndex) => (
//                 <TableRow
//                   key={row.id || rowIndex}
//                   className={`transition-all duration-300 ease-in-out dark:hover:bg-zinc-600 hover:bg-zinc-300 ${
//                     auth.username === row.username &&
//                     auth.id === row.id &&
//                     'bg-gray-200 dark:bg-gray-800'
//                   }`}
//                 >
//                   {/* Dynamic Table Cells */}
//                   {dataKeys?.map((key, index) => (
//                     <TableCell
//                       key={index}
//                       className="2xl:!text-xl dark:text-zinc-200 text-zinc-900 max-2xl:!py-1"
//                     >
//                       {key.toLowerCase() === 'access' ? (
//                         row[key.toLowerCase()] === 'R' ? (
//                           'Read'
//                         ) : row[key.toLowerCase()] === 'W' ? (
//                           'Write'
//                         ) : (
//                           'N/A'
//                         )
//                       ) : typeof row[key] === 'boolean' ? (
//                         <Checkbox
//                           checked={row[key]}
//                           disabled
//                           className={`opacity-50 ${
//                             row[key] ? '!text-green-600' : '!text-zinc-200'
//                           }`}
//                         />
//                       ) : (
//                         row[key] ?? 'N/A'
//                       )}
//                     </TableCell>
//                   ))}

                 

//                   {/* Actions Section */}
//                   {actions && (
//                     <TableCell 
//                       className="max-2xl:!py-1"
//                       align="right"
//                     >
//                       <div className="flex justify-end space-x-2">
//                         {actions.map((action, index) => (
//                           <ActionButton
//                             key={index}
//                             name={action.name}
//                             icon={action.icon}
//                             action={action.action}
//                             id={row.id}
//                             className={action.className}
//                           />
//                         ))}
//                       </div>
//                     </TableCell>
//                   )}
//                 </TableRow>
//               ))
//             )}
//           </TableBody>
//         </Table>
//       </TableContainer>
//     </Paper>
//   );
// }

// export default TableData;




















import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import {
  Checkbox,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
} from '@mui/material';
import ActionButton from './ActionButton';
import { useContext, useState } from 'react';
import { AuthContext } from '../../Context/AuthProvider';

function TableData({ headers, data, dataKeys, actions, useFilter }) {
  const { auth } = useContext(AuthContext);
  const [filter, setFilter] = useState(useFilter?.options[0].value || '');

  const handleFilterChange = async event => {
    setFilter(event.target.value);
  };

  return (
    <Paper className="w-full mt-5 !rounded-lg !bg-white dark:!bg-[#0b111e] dark:!text-white">
      <TableContainer className="overflow-x-auto rounded-lg shadow-md" sx={{ minWidth: 550 }}>
        {/* Filter Section */}
        {useFilter && (
          <div className="flex justify-center items-center p-2 bg-gray-100 dark:bg-[#131b2d]">
            <span className="me-2 text-gray-800 dark:text-gray-300">Filter By: </span>
            <FormControl variant="outlined" className="w-48">
              <InputLabel className="dark:!text-gray-300">{useFilter.filterName}</InputLabel>
              <Select
                value={filter}
                onChange={handleFilterChange}
                label="Filter By"
                className="dark:!text-white dark:!bg-[#131b2d]"
              >
                {useFilter.options?.map((option, index) => (
                  <MenuItem key={index} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </div>
        )}

        <Table className="w-full">
          <TableHead className="p-3 !bg-white dark:!bg-[#131b2d]">
            <TableRow>
              {headers?.map((header, index) => (
                <TableCell
                  key={index}
                  className="2xl:!text-xl !font-bold !text-zinc-900 dark:!text-zinc-100 max-2xl:!py-2"
                >
                  {header}
                </TableCell>
              ))}
              {window.location.pathname === '/job-type' && (
                <TableCell className="2xl:!text-xl !font-bold !text-zinc-900 dark:!text-zinc-100 max-2xl:!py-2">
                  Bit Value
                </TableCell>
              )}
              {actions && (
                <TableCell
                  className="2xl:!text-xl !font-bold !text-zinc-900 dark:!text-zinc-100 max-2xl:!py-2"
                  align="right"
                >
                  Actions
                </TableCell>
              )}
            </TableRow>
          </TableHead>

          <TableBody>
            {data && data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={headers.length + (actions ? 2 : 1)} className="!text-zinc-900 dark:!text-zinc-100">
                  <div className="flex flex-col w-full items-center justify-center py-4">
                    <h1 className="mt-4 text-xl font-medium text-gray-600 dark:text-gray-300">
                      No Data Available
                    </h1>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              data?.map((row, rowIndex) => (
                <TableRow
                  key={row.id || rowIndex}
                  className={`transition-all duration-300 ease-in-out ${
                    rowIndex % 2 === 0 
                      ? 'bg-white dark:bg-[#0b111e]' 
                      : 'bg-zinc-50 dark:bg-[#131b2d]'
                  } hover:!bg-zinc-200 dark:hover:!bg-[#131b2d] ${
                    auth.username === row.username &&
                    auth.id === row.id &&
                    '!bg-gray-200 dark:!bg-[#131b2d]'
                  }`}
                >
                  {dataKeys?.map((key, index) => (
                    <TableCell
                      key={index}
                      className="2xl:!text-lg !text-zinc-900 dark:!text-zinc-100 max-2xl:!py-1"
                    >
                      {key.toLowerCase() === 'access' ? (
                        row[key.toLowerCase()] === 'R' ? (
                          'Read'
                        ) : row[key.toLowerCase()] === 'W' ? (
                          'Write'
                        ) : (
                          'N/A'
                        )
                      ) : typeof row[key] === 'boolean' ? (
                        <Checkbox
                          checked={row[key]}
                          disabled
                          className={`opacity-50 ${row[key] ? '!text-green-600 dark:!text-green-300' : '!text-zinc-400 dark:!text-zinc-600'}`}
                        />
                      ) : typeof row[key] === 'object' && row[key] !== null ? (
                        JSON.stringify(row[key])
                      ) : (
                        row[key] ?? 'N/A'
                      )}
                    </TableCell>
                  ))}

                  {actions && (
                    <TableCell align="right" className="max-2xl:!py-1">
                      <div className="flex justify-end space-x-2">
                        {actions.map((action, index) => (
                          <ActionButton
                            key={index}
                            name={action.name}
                            icon={action.icon}
                            action={action.action}
                            id={row.id}
                            className={action.className}
                          />
                        ))}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}

export default TableData;
