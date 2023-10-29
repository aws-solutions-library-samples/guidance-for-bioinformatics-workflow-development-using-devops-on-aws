
process QUANT {
    tag "$pair_id"
    container 'quay.io/nextflow/rnaseq-nf:v1.1'
    publishDir params.outdir, mode:'copy'
    
    input:
    path index 
    path reads1
    path reads2
    val pair_id
    
    output:
    path pair_id 

    script:
    """
    echo "Running salmon quant"
    mkdir -p $pair_id
    salmon quant --threads $task.cpus --libType=U -i $index -1 $reads1 -2 $reads2 -o $pair_id
    echo "Command done"
    ls -lR && sleep 60
    """
}
