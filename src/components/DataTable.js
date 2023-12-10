import React from 'react';
import {
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Box
} from '@chakra-ui/react';

const DataTable = () => {
    const data = [
        { title: 'Endless Harvest', difficulty: 'Easy' },
        { title: 'Coal and Pollution', difficulty: 'Medium' },
        { title: 'Early Childhood Education', difficulty: 'Hard' },
        { title: 'Endless Harvest', difficulty: 'Easy' },
        { title: 'Coal and Pollution', difficulty: 'Medium' },
        { title: 'Early Childhood Education', difficulty: 'Hard' },
        { title: 'Endless Harvest', difficulty: 'Easy' },
        { title: 'Coal and Pollution', difficulty: 'Medium' },
        { title: 'Early Childhood Education', difficulty: 'Hard' },
        { title: 'Endless Harvest', difficulty: 'Easy' },
        { title: 'Coal and Pollution', difficulty: 'Medium' },
        { title: 'Early Childhood Education', difficulty: 'Hard' },
        // ... more data
    ];

    return (
        <Box w="100%" overflowX="auto">
            <Table width="100%" variant="simple">
                <Thead>
                    <Tr>
                        <Th fontWeight="bold">#</Th>
                        <Th fontWeight="bold">Title</Th>
                        <Th fontWeight="bold">Difficulty</Th>
                    </Tr>
                </Thead>
                <Tbody>
                    {data.map((item, index) => (
                        <Tr key={index} bg={index % 2 === 0 ? "gray.50" : "white"}>
                            <Td>{index + 1}</Td>
                            <Td>{item.title}</Td>
                            <Td>{item.difficulty}</Td>
                        </Tr>
                    ))}
                </Tbody>
            </Table>
        </Box>
    );
};

export default DataTable;
