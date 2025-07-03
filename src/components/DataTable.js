import React, { useState, useEffect } from 'react';
import { Table, Thead, Tbody, Tr, Th, Td, Text, Box, Flex, Button, Spinner } from '@chakra-ui/react';
import { app } from '../firebase';
import { useRouter } from 'next/router';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const DataTable = ({ selectedOption }) => {
    const [data, setData] = useState([]);
    const [cache, setCache] = useState({}); // Cache to store data for each category
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [loading, setLoading] = useState(false);
    const resultsPerPage = 10;
    const router = useRouter();

    useEffect(() => {
        async function fetchData() {
            if (cache[selectedOption]) {
                // Use cached data
                const cachedData = cache[selectedOption];
                setData(cachedData);
                setTotalPages(Math.ceil(cachedData.length / resultsPerPage));
            } else {
                // Fetch new data if not in cache
                setLoading(true);
                const db = getFirestore(app);
                const collectionName = `${selectedOption.toLowerCase()}Passages`;
                const querySnapshot = await getDocs(collection(db, collectionName));
                const fetchedData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                
                setData(fetchedData);
                setTotalPages(Math.ceil(fetchedData.length / resultsPerPage));
                setLoading(false);
                
                // Update cache with new data
                setCache(prev => ({ ...prev, [selectedOption]: fetchedData }));
            }
        }

        fetchData();
    }, [selectedOption, cache]);

    const handleRowClick = id => {
        const routePath = `/${selectedOption.toLowerCase()}question/${id}`;
        router.push(routePath);
    };

    const getDifficultyColor = difficulty => ({
        'Hard': 'red.500',
        'Medium': 'yellow.500',
        'Easy': 'green.500',
        'Task 2': 'black.500'
    }[difficulty] || 'gray.500');

    return (
        <Box overflowX="auto" minHeight="400px">
            {loading ? (
                <Flex justifyContent="center" alignItems="center" height="100%" direction="column">
                    <Spinner size="xl" thickness="4px" speed="0.65s" emptyColor="gray.200" color="blue.500" />
                    <Text fontSize="xl" mt={3}>Loading...</Text>
                </Flex>
            ) : (
                <Table variant="simple">
                    <Thead>
                        <Tr>
                            <Th fontWeight="bold">#</Th>
                            <Th fontWeight="bold">Title</Th>
                            <Th fontWeight="bold">Difficulty</Th>
                        </Tr>
                    </Thead>
                    <Tbody>
                        {data.slice((currentPage - 1) * resultsPerPage, currentPage * resultsPerPage).map((item, index) => (
                            <Tr key={item.id} onClick={() => handleRowClick(item.id)} cursor="pointer" bg={index % 2 === 0 ? "gray.50" : "white"}>
                                <Td>{(currentPage - 1) * resultsPerPage + index + 1}</Td>
                                <Td>{item.passageTitle}</Td>
                                <Td color={getDifficultyColor(item.passageDifficulty)} fontWeight="bold">{item.passageDifficulty}</Td>
                            </Tr>
                        ))}
                    </Tbody>
                </Table>
            )}
        </Box>
    );
};

export default DataTable;
