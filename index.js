const fs = require('fs');
const path = require('path');
const glob = require('glob');
const sqlFormatter = require('sql-formatter');

// Configurações
const EXTENSIONS_RELEVANTES = ['.sql', '.java', '.js']; // Extensões de arquivos a serem considerados
const DELIMITADOR = '---\n'; // Delimitador para separar as queries no console

// Função para identificar e extrair queries SQL de um arquivo
function extrairQueriesDoArquivo(caminhoArquivo) {
    const conteudo = fs.readFileSync(caminhoArquivo, 'utf8');
    const padraoQuerySQL = /(?:"[^"]*"|'[^']*'|\+|\s)*((?:SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)[\s\S]*?)(?=;|$)/gi;
    let queries = [];
    let match;

    // Encontra todas as queries SQL no arquivo
    while ((match = padraoQuerySQL.exec(conteudo)) !== null) {
        let query = match[1].replace(/\s*\+\s*/g, ' '); // Remove concatenações com +
        queries.push(query);
    }

    return queries;
}

// Função para formatar e exibir as queries SQL
function formatarEExibirQueries(queries) {
    queries.forEach(query => {
        const queryFormatada = sqlFormatter.format(query);
        console.log(queryFormatada);
        console.log(DELIMITADOR);
    });
}

// Função principal para varrer o repositório
function varrerRepositorio(diretorio) {
    const padraoArquivos = `**/*{${EXTENSIONS_RELEVANTES.join(',')}}`;
    glob(path.join(diretorio, padraoArquivos), (erro, arquivos) => {
        if (erro) {
            console.error('Erro ao varrer o repositório:', erro);
            return;
        }

        arquivos.forEach(arquivo => {
            const queries = extrairQueriesDoArquivo(arquivo);
            if (queries.length > 0) {
                console.log(`Queries encontradas no arquivo: ${arquivo}`);
                formatarEExibirQueries(queries);
            }
        });
    });
}

// Ponto de entrada do script
const DIRETORIO_REPOSITORIO = './caminho/do/repositorio'; // Substitua pelo caminho do repositório
varrerRepositorio(DIRETORIO_REPOSITORIO);